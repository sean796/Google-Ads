import { Sparkles } from "lucide-react";
import { LLMSettingsTabContent } from "@/components/LLMSettingsTabContent";
import {
  DASHBOARD_SETTINGS_GROUP_CLASS,
  DASHBOARD_SETTINGS_PANEL_CLASS,
} from "@/components/manager/dashboard/dashboard-panel-styles";

export type AiModelsSettingsContentProps = {
  researchModel: string;
  setResearchModel: (model: string) => void;
  blogModel: string;
  setBlogModel: (model: string) => void;
  imageModel: string;
  setImageModel: (model: string) => void;
  metaModel: string;
  setMetaModel: (model: string) => void;
  reportModel: string;
  setReportModel: (model: string) => void;
  adsModel: string;
  setAdsModel: (model: string) => void;
  videoModel: string;
  setVideoModel: (model: string) => void;
  decisionModel: string;
  setDecisionModel: (model: string) => void;
  temperature: number;
  setTemperature: (value: number) => void;
  maxTokens: number;
  setMaxTokens: (value: number) => void;
  topP: number;
  setTopP: (value: number) => void;
};

export function AiModelsSettingsContent(props: AiModelsSettingsContentProps) {
  return (
    <div className={`${DASHBOARD_SETTINGS_PANEL_CLASS} space-y-4 text-white`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-white" aria-hidden />
        <h2 className="text-base font-semibold text-white">AI &amp; Models</h2>
      </div>

      <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
        <LLMSettingsTabContent
          researchModel={props.researchModel}
          onResearchModelChange={props.setResearchModel}
          blogModel={props.blogModel}
          onBlogModelChange={props.setBlogModel}
          imageModel={props.imageModel}
          onImageModelChange={props.setImageModel}
          metaModel={props.metaModel}
          onMetaModelChange={props.setMetaModel}
          reportModel={props.reportModel}
          onReportModelChange={props.setReportModel}
          adsModel={props.adsModel}
          onAdsModelChange={props.setAdsModel}
          videoModel={props.videoModel}
          onVideoModelChange={props.setVideoModel}
          decisionModel={props.decisionModel}
          onDecisionModelChange={props.setDecisionModel}
          temperature={props.temperature}
          onTemperatureChange={props.setTemperature}
          maxTokens={props.maxTokens}
          onMaxTokensChange={props.setMaxTokens}
          topP={props.topP}
          onTopPChange={props.setTopP}
        />
      </div>
    </div>
  );
}
