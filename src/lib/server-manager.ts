/**
 * Server Manager Utility
 * Frontend utility to interact with the server manager service
 * Manages on-demand startup of the keyword server
 */
import { logger } from "@/lib/logger";

// Server manager runs on port 3002, keyword server on 3001
const SERVER_MANAGER_URL = import.meta.env.VITE_SERVER_MANAGER_BASE || 
  (import.meta.env.DEV ? 'http://localhost:3002' : '/api/server-manager');

const KEYWORD_SERVER_URL = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

const MAX_WAIT_TIME = 30000; // 30 seconds
const POLL_INTERVAL = 500; // 500ms

/**
 * Check if the keyword server is running by calling its health endpoint
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${KEYWORD_SERVER_URL}/api/mcp/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    return false;
  }
}

/**
 * Check if the server manager is running
 */
export async function checkServerManagerHealth(): Promise<boolean> {
try {
    const response = await fetch(`${SERVER_MANAGER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    const isHealthy = data.status === 'ok';
return isHealthy;
  } catch (error) {
return false;
  }
}

/**
 * Get the status of the keyword server from the server manager
 */
export async function getServerStatus(): Promise<{
  running: boolean;
  hasProcess: boolean;
  pid: number | null;
  uptime: number | null;
  port: number;
  url: string;
} | null> {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.success ? data : null;
  } catch (error) {
    logger.error('[Server Manager] Error getting status:', error);
    return null;
  }
}

/**
 * Start the keyword server via server manager
 */
export async function startServer(): Promise<{
  success: boolean;
  message: string;
  alreadyRunning?: boolean;
  pid?: number;
  startupTime?: number;
}> {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(35000) // Slightly longer than max wait time
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        message: 'Server start request timed out'
      };
    }
    
    // Check if server manager is running
    const managerRunning = await checkServerManagerHealth();
    if (!managerRunning) {
      return {
        success: false,
        message: 'Server manager is not running. Please start it first with: node server/server-manager.js'
      };
    }
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error starting server'
    };
  }
}

/**
 * Stop the keyword server via server manager
 */
export async function stopServer(): Promise<{
  success: boolean;
  message: string;
}> {
  return {
    success: true,
    message: "Keyword research uses /api/mcp DataForSEO. No local keyword server to stop.",
  };
}

/**
 * Wait for the server to be ready by polling the health endpoint
 */
export async function waitForServerReady(
  onProgress?: (message: string) => void
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    const isReady = await checkServerHealth();
    
    if (isReady) {
      return true;
    }
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (onProgress) {
      onProgress(`Waiting for server to start... (${elapsed}s)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  return false;
}

/**
 * Ensure the keyword server is running
 * Checks health, starts via server manager if needed, and waits for readiness
 */
export async function ensureServerRunning(
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  message: string;
  wasAlreadyRunning?: boolean;
}> {
  // First, check if server is already running
  const isRunning = await checkServerHealth();
  if (isRunning) {
    return {
      success: true,
      message: 'Server is already running',
      wasAlreadyRunning: true
    };
  }
  
  // Check if server manager is available
  const managerRunning = await checkServerManagerHealth();
  if (!managerRunning) {
    return {
      success: false,
      message: 'Server manager is not running. Please start it with: node server/server-manager.js'
    };
  }
  
  // Start the server
  if (onProgress) {
    onProgress('Starting keyword server...');
  }
  
  const startResult = await startServer();
  
  if (!startResult.success) {
    return {
      success: false,
      message: startResult.message
    };
  }
  
  // If it was already running, we're done
  if (startResult.alreadyRunning) {
    return {
      success: true,
      message: 'Server is running',
      wasAlreadyRunning: true
    };
  }
  
  // Wait for server to be ready
  if (onProgress) {
    onProgress('Waiting for server to be ready...');
  }
  
  const isReady = await waitForServerReady(onProgress);
  
  if (!isReady) {
    return {
      success: false,
      message: 'Server failed to start within 30 seconds'
    };
  }
  
  return {
    success: true,
    message: 'Server is ready',
    wasAlreadyRunning: false
  };
}

