/** Notify copy: research message builders. */

export function notifyExtractedXPaaQuestions(resultQuestionsLength: string | number): string {
  return `Extracted ${resultQuestionsLength} PAA questions`;
}

export function notifyFailedToExtractPaaQuestionsX(_errorInstanceofErrorErrorMessageUnknownE: string | number): string {
  return "PAA extraction failed";
}

export function notifyLoadedXRowsFromCsv(loadedrowsLength: string | number): string {
  return `Loaded ${loadedrowsLength} rows from CSV`;
}

export function notifyFailedToLoadCsvX(_errorInstanceofErrorErrorMessageUnknownE: string | number): string {
  return "CSV load failed";
}


export function notifyPostingToXWordpressSiteSNames(siteCount: number, _names?: string): string {
  return `Posting to ${siteCount} WordPress site(s)`;
}

export function notifyLoadedXRowSFromSitemapMergePlan(parsedLength: string | number): string {
  return `Loaded ${parsedLength} row(s) from Sitemap merge plan.`;
}

export function notifyLoadedCsvX(_fileName: string | number): string {
  return "CSV loaded";
}

export function notifyWikipediaContentSavedToKnowledgeBas(_chunkCount: string | number, _sizeKb: string | number): string {
  return "Wikipedia saved";
}

export function notifyWikipediaContentSavedToKnowledgeBas2(_chunksLength: string | number): string {
  return "Wikipedia saved";
}

export function notifyDeselectedAllXSemanticKeywords(allsemanticLength: string | number): string {
  return `Deselected all ${allsemanticLength} semantic keywords`;
}

export function notifySelectedAllXSemanticKeywords(allsemanticLength: string | number): string {
  return `Selected all ${allsemanticLength} semantic keywords`;
}

export function notifyDeselectedAllXKeywordsInX(clusterKeywordsLength: string | number, clusterName: string | number): string {
  return `Deselected all ${clusterKeywordsLength} keywords in "${clusterName}"`;
}

export function notifySelectedAllXKeywordsInX(clusterKeywordsLength: string | number, clusterName: string | number): string {
  return `Selected all ${clusterKeywordsLength} keywords in "${clusterName}"`;
}

export function notifyGscX(gscresError: string | number): string {
  return `GSC: ${gscresError}`;
}

export function notifyCompetitorDataSourceWarning(sourceLabel: string | number, msg: string | number): string {
  return `${sourceLabel}: ${msg}`;
}

export function notifySeedMetricsReadyX(added: string | number): string {
  return `Seed metrics ready (${added})`;
}

export function notifyExcludedXNonCompetitorDomainSEGY(srrawRowsLengthSrRowsLength: string | number): string {
  return `Excluded ${srrawRowsLengthSrRowsLength} non-competitor domain(s) (e.g. YouTube, Facebook, Reddit).`;
}

export function notifyGscRelevanceFilterRemovedXCompetito(beforegscSrRowsLength: string | number): string {
  return `GSC relevance filter removed ${beforegscSrRowsLength} competitor row(s).`;
}

export function notifyXLineSCouldNotBeParsedAsADomain(skippedInvalid: string | number): string {
  return `${skippedInvalid} line(s) could not be parsed as a domain or URL.`;
}

export function notifyXLineSSkippedSameAsYourSeedSite(skippedSeed: string | number): string {
  return `${skippedSeed} line(s) skipped (same as your seed site).`;
}

export function notifyXLineSSkippedPortfolioBlocklist(skippedPortfolio: string | number): string {
  return `${skippedPortfolio} line(s) skipped (portfolio blocklist).`;
}

export function notifyXDuplicateLineSSkippedAlreadyQueue(skippedDup: string | number): string {
  return `${skippedDup} duplicate line(s) skipped (already queued or repeated in paste).`;
}

export function notifySkippedInvalidLineXx(linePreview: string | number, ellipsis: string | number): string {
  return `Skipped invalid line: ${linePreview}${ellipsis}`;
}

export function notifyXX2(dk: string | number, msg: string | number): string {
  return `${dk}: ${msg}`;
}

export function notifyXLineSSkippedAlreadyInTheTable(skippedInTable: string | number): string {
  return `${skippedInTable} line(s) skipped (already in the table).`;
}

export function notifyFileTooLargeMaxXMb(maxMb: string | number): string {
  return `File too large (max ${maxMb} MB).`;
}

export function notifyDfsXXX(_placeBusinessname: string | number, _placeIdlabel: string | number, error: string | number): string {
  return `DFS row failed: ${error}`;
}

export function notifyDfsXXNoWebsite(_placeBusinessname: string | number, _placeIdlabel: string | number): string {
  return "DFS row: no website";
}

export function notifyDfsSkipX(host: string | number): string {
  return `DFS skip: ${host}`;
}

export function notifyXXX2(_semrushenhancedSemrushDataforseo: string | number, _rDomainforapi: string | number, rMessage: string | number): string {
  return `Semrush: ${rMessage}`;
}

export function notifyResearchXX(_rDomainforapi: string | number, rMessage: string | number): string {
  return `Research: ${rMessage}`;
}

export function notifyGridImportXUpdatedX(semrushNewRows: string | number, semrushRefreshedRows: string | number): string {
  return `Grid import: +${semrushNewRows}, updated ${semrushRefreshedRows}`;
}

export function notifyAddedXFromGrid(semrushNewRows: string | number): string {
  return `Added ${semrushNewRows} from grid`;
}

export function notifyUpdatedXFromGrid(semrushRefreshedRows: string | number): string {
  return `Updated ${semrushRefreshedRows} from grid`;
}

export function notifyGscX2(outGscerror: string | number): string {
  return `GSC: ${outGscerror}`;
}

export function notifyDownloadedXSapRowS(lastsapschedulerowsLength: string | number): string {
  return `Downloaded ${lastsapschedulerowsLength} SAP row(s).`;
}

export function notifyGridCsvSapScanX(gridsapresError: string | number): string {
  return `Grid CSV (SAP scan): ${gridsapresError}`;
}

export function notifyDataforseoXX(rDomainforapi: string | number, rMessage: string | number): string {
  return `DataForSEO (${rDomainforapi}): ${rMessage}`;
}

export function notifyAddedXCompetitorSFromGridCsvUpdat(semrushNewRows: string | number, semrushRefreshedRows: string | number): string {
  return `Added ${semrushNewRows} competitor(s) from grid CSV; updated ${semrushRefreshedRows} already listed.`;
}

export function notifyAddedXCompetitorSFromGridCsv(semrushNewRows: string | number): string {
  return `Added ${semrushNewRows} competitor(s) from grid CSV.`;
}

export function notifyUpdatedXCompetitorSFromGridCsvWer(semrushRefreshedRows: string | number): string {
  return `Updated ${semrushRefreshedRows} competitor(s) from grid CSV (were already in your list).`;
}

export function notifySiteAuditFinishedWithXPartialError(auditresAuditErrorsLength: string | number): string {
  return `Site audit finished with ${auditresAuditErrorsLength} partial errors; strategy will use available data.`;
}

export function notifySiteAuditSkippedX(auditresError: string | number): string {
  return `Site audit skipped: ${auditresError}`;
}

export function notifySiteAuditSkippedX2(auditMsg: string | number): string {
  return `Site audit skipped: ${auditMsg}`;
}

export function notifyPresenterTalkScriptFailedX(msg: string | number): string {
  return `Presenter talk script failed: ${msg}`;
}

export function notifyGridXXX(_placeBusinessname: string | number, _placeIdlabel: string | number, error: string | number): string {
  return `Grid row failed: ${error}`;
}

export function notifyGridXXNoWebsite(_placeBusinessname: string | number, _placeIdlabel: string | number): string {
  return "Grid row: no website";
}

export function notifyGridSkipX(host: string | number): string {
  return `Grid skip: ${host}`;
}

export function notifyDownloadedXRedirects(rowCount: string | number): string {
  return `Downloaded ${rowCount} redirects`;
}

export function notifyAnalyzedXRedirectSFromYourCsvTemp(redirectcsvRowsLength: string | number): string {
  return `Analyzed ${redirectcsvRowsLength} redirect(s) from your CSV (temporal merge + family_id on download).`;
}

export function notifyLoadedXContentPlanSFromRedirectEx(resResultContentsheetLength: string | number): string {
  return `Loaded ${resResultContentsheetLength} content plan(s) from redirect export.`;
}

export function notifyRedirectCsvPlanX(planSummary: string | number): string {
  return `NEO Pulse redirect plan: ${planSummary}`;
}

export function notifyDownloadedXRedirectRowSForRankMat(redirectrowsLength: string | number): string {
  return `Downloaded ${redirectrowsLength} redirect row(s) for NEO Pulse redirect import.`;
}

export function notifyExportedXRowSToCsv(rowsLength: string | number): string {
  return `Exported ${rowsLength} row(s) to CSV.`;
}

export function notifyPostBodiesXOfXFilledReloadTheSit(got: string | number, expected: string | number): string {
  return `Post bodies: ${got} of ${expected} filled. Reload the sitemap after inventory loads, or check REST credentials.`;
}

export function notifySetDateModifierToXForAllRows(iso: string | number): string {
  return `Set date modifier to ${iso} for all rows.`;
}

export function notifyFocusKeywordsDerivedForXRowS(ensured: string | number): string {
  return `Focus keywords derived for ${ensured} row(s).`;
}

export function notifyKeywordsFinishedXUpdatedXFailed(ensured: string | number, failed: string | number): string {
  return `Keywords finished: ${ensured} updated, ${failed} failed.`;
}

export function notifyKeywordDerivationFailedForXRowS(failed: string | number): string {
  return `Keyword derivation failed for ${failed} row(s).`;
}

export function notifyResearchFailedForAllXRowSBriefJs(_researchTotal: string | number): string {
  return "Research failed";
}

export function notifyResearchRanOnXRowSButBriefJsonW(_researchTotal: string | number, _serpOnly: string | number, _failed: string | number): string {
  return "Research incomplete";
}

export function notifyResearchFinishedXXBriefJsonUpdated(
  _briefUpdated: number,
  _researchTotal: number,
  serpOnly?: boolean
): string {
  return serpOnly ? "Research done (SERP only)" : "Research done";
}

export function notifyFinishedResearchForXRowSDataforseo(_briefUpdated: string | number): string {
  return "Research done";
}

export function notifyStartingBulkContentOptimizationForX(_urlsLength: string | number): string {
  return "Bulk optimization started";
}

export function notifyStartingAiExtraTextForXUrlSUseT(_urlsLength: string | number): string {
  return "AI extra text started";
}

export function notifyOptimizeAllSerpFinishedX(partsSummary: string | number): string {
  return `Optimize all (SERP) finished: ${partsSummary}.`;
}

export function notifyFailedToCheckServerStatusX(_servercheckerrorInstanceofErrorServerche: string | number): string {
  return "Server status check failed";
}

export function notifyServerErrorX(_serverresultMessageUnknownServerError: string | number): string {
  return "Keyword server error";
}

export function notifyAnalyzingKeywordX(primaryKeyword: string | number): string {
  return `Analyzing keyword: ${primaryKeyword}`;
}

export function notifyKeywordXAnalyzedSuccessfully(keyword: string | number): string {
  return `Keyword "${keyword}" analyzed successfully`;
}

export function notifyAiAnalysisCompletedXH2SectionsXCo(_finalanalysisH2suggestionsLength: string | number, _finalanalysisContentgapsLength: string | number, _finalanalysisResearchlinksLength0: string | number): string {
  return "AI analysis done";
}

export function notifyAnalysisFailedX(_errorMessage: string | number): string {
  return "Analysis failed";
}

export function notifyUnexpectedErrorX(_errorMessage: string | number): string {
  return "Unexpected error";
}

export function notifyKeywordDataReceivedButAiAnalysisFa(_errorMessage: string | number): string {
  return "AI analysis failed";
}

export function notifyErrorX(_errorMessage: string | number): string {
  return "Request failed";
}

export function notifyReshuffledXNewKeywordsXHeld(newvariationsLengthNewlongtailLengthNews: string | number, selectedkeywordsLength: string | number): string {
  return `Reshuffled: ${newvariationsLengthNewlongtailLengthNews} new keywords (${selectedkeywordsLength} held)`;
}

export function notifyNoClientsSelectedInCategoryXAddTa(tagFilter: string | number): string {
  return `No clients selected in category “${tagFilter}”. Add tags in property Site Settings.`;
}

export function notifyGscTop10CsvXRowsXClientsXHadNo(rowsLength: string | number, okCount: string | number, failCount: string | number): string {
  return `GSC top 10 CSV, ${rowsLength} rows (${okCount} clients, ${failCount} had no data).`;
}

export function notifyGscTop10CsvXRowsXClients(rowsLength: string | number, okCount: string | number): string {
  return `GSC top 10 CSV, ${rowsLength} rows (${okCount} clients).`;
}

export function notifyBulkCsvTemplateReadyXXRowsX(contentKindLabel: string | number, rowCount: string | number, invNote: string | number): string {
  return `Bulk CSV template ready (${contentKindLabel}), ${rowCount} rows.${invNote}`;
}

export function notifyBulkTemplateCouldNotFinishX(_msg: string | number): string {
  return "Bulk template failed";
}

export function notifyGridLoadedXRowsDominantKeywordX(resultMatchedrowcount: string | number, resultDominantkeyword: string | number): string {
  return `Grid loaded, ${resultMatchedrowcount} rows, dominant keyword “${resultDominantkeyword}”.`;
}

export function notifyDownloadedXRowS(filteredLength: string | number): string {
  return `Downloaded ${filteredLength} row(s)`;
}

export function notifyBulkCsvTemplateDownloadedXRowS(artifactRowcount: string | number): string {
  return `Bulk CSV template downloaded, ${artifactRowcount} row(s)`;
}

export function notifyKnowledgeGraphSummarizedXkbXkb(beforeKb: string | number, afterKb: string | number): string {
  return `Knowledge graph summarized: ${beforeKb}KB → ${afterKb}KB`;
}

export function notifyKnowledgeGraphSavedToKnowledgeBase(_sizeText: string | number): string {
  return "Knowledge graph saved";
}

export function notifyFailedToSaveGraphToKnowledgeBaseX(_errorMessageUnknownError: string | number): string {
  return "Graph save failed";
}

export function notifyXXXXPosts(
  _siteName: string | number,
  displayMessage: string | number,
  processed: string | number,
  total: string | number,
): string {
  return `${displayMessage} (${processed}/${total})`;
}

export function notifyXX3(_siteName: string | number, displayMessage: string | number): string {
  return String(displayMessage);
}

export function notifyKnowledgeGraphGeneratedForXSavingT(_siteName: string | number): string {
  return "Knowledge graph generated, saving";
}

export function notifyStartingKnowledgeGraphWorkflowForX(_siteNameSiteSiteurl: string | number): string {
  return "Starting knowledge graph workflow";
}

export function notifyStartingNapExtractionAndLinkGraphG(_siteNameSiteSiteurl: string | number): string {
  return "Starting NAP and link graph";
}

export function notifyNapExtractionAndLinkGraphGeneration(_siteNameSiteSiteurl: string | number): string {
  return "NAP and link graph complete";
}

export function notifyAutoTriggeringKnowledgeGraphGenerati(_siteNameSiteSiteurl: string | number): string {
  return "Auto-triggering knowledge graph";
}

export function notifyDetectedXLocationxAndAddedToKnowle(locationCount: string | number, locationcount1S: string | number): string {
  return `Detected ${locationCount} location${locationcount1S}, saved to KB`;
}

export function notifyNapExtractionFailedX(_napresultErrorUnknownError: string | number): string {
  return "NAP extraction failed";
}

export function notifyFailedToExtractNapX(_errorInstanceofErrorErrorMessageUnknownE: string | number): string {
  return "NAP extract failed";
}

export function notifyKnowledgeGraphWorkflowFailedX(_errorMessage: string | number): string {
  return "Knowledge graph failed";
}

export function notifyFailedX(_errorMessage: string | number): string {
  return "Workflow failed";
}

export function notifyNapFileNotFoundX(napFileName: string | number): string {
  return `NAP file not found: ${napFileName}`;
}

export function notifyFailedToTriggerKnowledgeGraphX(_errorInstanceofErrorErrorMessageUnknownE: string | number): string {
  return "Knowledge graph trigger failed";
}

export function notifyDownloadedXTargetRowS(filteredLength: string | number): string {
  return `Downloaded ${filteredLength} target row(s)`;
}

export function notifyDownloadedXRowS2(rowsLength: string | number): string {
  return `Downloaded ${rowsLength} row(s)`;
}

export function notifyAiAllMetaFailedForAllXRowS(totalRows: string | number): string {
  return `AI All Meta failed for all ${totalRows} row(s).`;
}

export function notifyAiAllMetaFinishedXXUpdatedSkipped(
  applied: number,
  totalRows: number,
  skippedNoKeywordCount?: number,
  skippedNoBriefCount?: number,
  failedCount?: number
): string {
  let msg = `AI All Meta finished: ${applied}/${totalRows} updated`;
  if (skippedNoKeywordCount) msg += `, ${skippedNoKeywordCount} missing keyword`;
  if (skippedNoBriefCount) msg += `, ${skippedNoBriefCount} skipped`;
  if (failedCount) msg += `, ${failedCount} failed`;
  return `${msg}.`;
}

export function notifyAiAllMetaFinishedForXPageS(applied: string | number): string {
  return `AI All Meta finished for ${applied} page(s).`;
}

export function notifyAiFaqOptimizationFinishedForXPage(ok: string | number): string {
  return `AI FAQ optimization finished for ${ok} page(s).`;
}

export function notifyCouldNotLoadSerpFileForTheJsonBr(_serpresStatus: string | number): string {
  return "SERP file load failed";
}

export function notifyNoBulkRowsToCurateX(detail: string | number): string {
  return `No bulk rows to curate. ${detail}`;
}

export function notifyXClientSSkippedX(failedclientsLength: string | number, _names: string | number): string {
  return `${failedclientsLength} client(s) skipped`;
}

export function notifyGridEntityPackageStepFailedX(msg: string | number): string {
  return `Grid entity package step failed: ${msg}`;
}

export function notifyRemovedXRowSOutsideTheUploadedGri(droppedLength: string | number): string {
  return `Removed ${droppedLength} row(s) outside the uploaded grid footprint before final review.`;
}

export function notifyQuarterPostCapKeptTopXPostsByGsc(BENCHMARK_BULK_QUARTER_POST_ROW_CAP: string | number, trimmed: string | number): string {
  return `Quarter post cap: kept top ${BENCHMARK_BULK_QUARTER_POST_ROW_CAP} posts by GSC (${trimmed} extra row(s) dropped).`;
}

/** Inventory pass 2 */
