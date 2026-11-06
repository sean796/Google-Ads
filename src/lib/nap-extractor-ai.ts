import { logger } from "@/lib/logger";
import type { NAPInfo, Location } from '@/components/integrations/types';
import { streamChatCompletion } from './api';
import { getResearchModel } from './optimization-settings-storage';

/**
 * Uses AI to intelligently extract locations from scraped content (token optimized)
 */
export async function extractLocationsWithAI(
  scrapedPages: Array<{ title: string; content: string; url: string }>,
  apiKey: string,
  onProgress?: (message: string) => void,
  siteId?: string
): Promise<NAPInfo | null> {
  onProgress?.('🤖 AI analyzing pages to find all locations...');
  
  // Token optimization: Limit content per page and total content
  const maxContentPerPage = 2000; // Reduced from 3000
  const maxTotalContent = 15000; // Reduced from 30000
  
  // Combine all page content with limits
  let totalLength = 0;
  const combinedContent = scrapedPages.map((page, index) => {
    const pageContent = page.content.substring(0, maxContentPerPage);
    const pageText = `=== Page ${index + 1}: ${page.title} (${page.url}) ===\n${pageContent}`;
    
    if (totalLength + pageText.length > maxTotalContent) {
      return null; // Skip if we'd exceed limit
    }
    
    totalLength += pageText.length;
    return pageText;
  }).filter(Boolean).join('\n\n---\n\n');

  const systemPrompt = `You are a LOCAL CONTENT SPECIALIST and expert at extracting complete business location information (NAPE: Name, Address, Phone, Email) from website content. Your job is to find FULL, COMPLETE contact details for each location.

CRITICAL REQUIREMENTS - ACT LIKE A LOCAL CONTENT SPECIALIST:
1. Extract ALL locations found across pages - be thorough and comprehensive
2. For EACH location, extract COMPLETE details:
   - Full business name (location-specific if different, e.g., "Business Name - City Location")
   - Complete street address (street number, street name, suite/unit if present)
   - City name (full city name, not abbreviated)
   - State (2-letter abbreviation: FL, CA, TX, etc.)
   - ZIP code (5-digit or 9-digit format)
   - Phone number (location-specific if available, otherwise general)
   - Email address (location-specific if available, otherwise use general business email)
3. EMAIL FALLBACK RULE: If a location doesn't have a specific email, use the general business email from the contact page or footer
4. Be thorough - look in:
   - Contact pages
   - Location pages
   - Footer sections
   - Header/contact bars
   - Service area pages
   - About pages
   - Any structured data (JSON-LD, microdata)
5. Mark primary/main location as isDefault: true
6. Deduplicate - same address = one location
7. DO NOT use "Not specified" or placeholder text - use empty strings "" or omit fields if data is truly not available
8. Return ONLY valid JSON

Format:
{
  "name": "Business name",
  "address": "Primary address",
  "phone": "Primary phone",
  "email": "Primary email",
  "locations": [
    {
      "name": "Location name",
      "address": "Street address",
      "city": "City",
      "state": "ST",
      "zip": "12345",
      "phone": "Phone",
      "email": "Email address",
      "isDefault": true/false
    }
  ]
}`;

  const userPrompt = `As a LOCAL CONTENT SPECIALIST, analyze this website content and extract ALL business locations with COMPLETE NAPE (Name, Address, Phone, Email) information.

Be thorough and extract:
- Full business names for each location (include location identifier if present)
- Complete street addresses (not just city/state)
- Full city names
- State abbreviations
- ZIP codes
- Phone numbers (location-specific preferred)
- Email addresses (location-specific if available, otherwise use general business email)

Content to analyze:
${combinedContent}

Extract every location mentioned. For locations without specific emails, use the general business email found in contact sections or footer. Return complete JSON with all location details.`;

  try {
    let aiResponse = '';
    await streamChatCompletion({
      apiKey,
        model: getResearchModel(siteId),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 3000, // Reduced from 4000
      topP: 0.9,
      onContentChunk: (chunk) => {
        aiResponse += chunk;
      },
    });

    if (!aiResponse || aiResponse.trim().length === 0) {
      return null;
    }

    // Extract JSON from response
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonMatch = [jsonMatch[0], jsonMatch[1]];
      }
    }

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      interface RawNapLocation {
        name?: string;
        address?: string;
        streetAddress?: string;
        city?: string;
        addressLocality?: string;
        state?: string;
        addressRegion?: string;
        zip?: string;
        postalCode?: string;
        zipCode?: string;
        phone?: string;
        telephone?: string;
        email?: string;
        emailAddress?: string;
        isDefault?: boolean;
      }
      const parsed = JSON.parse(jsonText) as {
        name?: string;
        address?: string;
        phone?: string;
        email?: string;
        locations?: RawNapLocation[];
      };

      // Clean up "Not specified" values
      const cleanValue = (val: string | undefined): string | undefined => {
        if (!val || val === 'Not specified' || val === 'not specified' || val.trim() === '') {
          return undefined;
        }
        return val.trim();
      };
      
      const napInfo: NAPInfo = {
        name: cleanValue(parsed.name),
        address: cleanValue(parsed.address),
        phone: cleanValue(parsed.phone),
        email: cleanValue(parsed.email),
      };

      // Process locations
      if (parsed.locations && Array.isArray(parsed.locations) && parsed.locations.length > 0) {
        const locations: Location[] = parsed.locations.map((loc, index: number) => {
          // Clean up "Not specified" values
          const cleanValue = (val: string | undefined): string => {
            if (!val || val === 'Not specified' || val === 'not specified' || val.trim() === '') {
              return '';
            }
            return val.trim();
          };
          
          // Email fallback: use location-specific email, then general business email
          const locationEmail = cleanValue(loc.email || loc.emailAddress);
          const generalEmail = cleanValue(napInfo.email);
          const finalEmail = locationEmail || generalEmail || undefined;
          
          // Phone fallback: use location-specific phone, then general business phone
          const locationPhone = cleanValue(loc.phone || loc.telephone);
          const generalPhone = cleanValue(napInfo.phone);
          const finalPhone = locationPhone || generalPhone || '';
          
          // Name: prefer location-specific name, fallback to business name with location identifier
          let locationName = cleanValue(loc.name);
          if (!locationName && napInfo.name) {
            // Try to create location-specific name from city
            const city = cleanValue(loc.city || loc.addressLocality);
            if (city) {
              locationName = `${napInfo.name} - ${city}`;
            } else {
              locationName = napInfo.name;
            }
          }
          if (!locationName) {
            locationName = `Location ${index + 1}`;
          }
          
          return {
            id: `loc-${Date.now()}-${index}`,
            name: locationName,
            address: cleanValue(loc.address || loc.streetAddress),
            city: cleanValue(loc.city || loc.addressLocality),
            state: cleanValue(loc.state || loc.addressRegion),
            zip: cleanValue(loc.zip || loc.postalCode || loc.zipCode),
            phone: finalPhone,
            email: finalEmail,
            isDefault: loc.isDefault !== undefined ? loc.isDefault : index === 0,
          };
        });
        
        napInfo.locations = locations;
      } else if (napInfo.name || napInfo.address || napInfo.phone) {
        // Create single location from top-level fields
        // Parse address more carefully
        const fullAddress = napInfo.address || '';
        const addressParts = fullAddress.split(',').map(s => s.trim());
        
        // Try to extract street address (everything before city/state/zip)
        let streetAddress = '';
        let city = '';
        let state = '';
        let zip = '';
        
        if (addressParts.length >= 2) {
          // Last part is usually state/zip
          const lastPart = addressParts[addressParts.length - 1];
          const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
          if (stateZipMatch) {
            state = stateZipMatch[1];
            zip = stateZipMatch[2];
            // Second to last is usually city
            if (addressParts.length >= 3) {
              city = addressParts[addressParts.length - 2];
              streetAddress = addressParts.slice(0, -2).join(', ');
            } else {
              city = '';
              streetAddress = addressParts[0];
            }
          } else {
            // No state/zip pattern, assume last is city
            city = addressParts[addressParts.length - 1];
            streetAddress = addressParts.slice(0, -1).join(', ');
          }
        } else if (addressParts.length === 1) {
          streetAddress = addressParts[0];
        }
        
        napInfo.locations = [{
          id: `loc-${Date.now()}`,
          name: napInfo.name || 'Location',
          address: streetAddress || fullAddress,
          city: city || '',
          state: state || '',
          zip: zip || '',
          phone: napInfo.phone || '',
          email: napInfo.email || undefined,
          isDefault: true,
        }];
      }

      // Ensure at least one location is marked as default
      if (napInfo.locations && napInfo.locations.length > 0) {
        const hasDefault = napInfo.locations.some(loc => loc.isDefault);
        if (!hasDefault) {
          napInfo.locations[0].isDefault = true;
        }
      }

      return napInfo;
    }

    return null;
  } catch (error) {
    logger.error('[NAP Extractor] AI extraction error:', error);
    return null;
  }
}
