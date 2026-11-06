import React, { useState } from 'react';
import {
  GitFork,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  Sliders,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';
import { VendorButton as Button, Input, Label, Textarea, Badge } from "@/ui";

import {
  DASHBOARD_SETTINGS_GROUP_CLASS,
  DASHBOARD_SETTINGS_PANEL_CLASS,
} from '@/components/manager/dashboard/dashboard-panel-styles';
import { runDecisionTreePipeline } from '@/lib/decision-tree/decision-tree-runner';
import { DEFAULT_DECISION_THRESHOLDS } from '@/lib/decision-tree/decision-tree-defaults';
import type {
  DecisionTreeAuditEntry,
  DecisionTreeState,
  DecisionTreeThresholds,
  TerminalState,
} from '@/lib/decision-tree/decision-tree-types';

export function DecisionTreeManagerContent() {
  const [thresholds, setThresholds] = useState<DecisionTreeThresholds>(DEFAULT_DECISION_THRESHOLDS);
  const [topicTitle, setTopicTitle] = useState('10 Best Treadmills for Small Apartments (2026 Guide)');
  const [primaryKeyword, setPrimaryKeyword] = useState('best treadmills for small apartments');
  const [mustInclude, setMustInclude] = useState('noise levels, foldability, incline, under-desk options');
  const [sampleDraft, setSampleDraft] = useState(
    `Looking for the best treadmills for small apartments? If you're short on square footage, choosing the right folding or under-desk treadmill can transform your daily fitness routine without dominating your living room.

In this guide, we evaluate the top compact treadmills on key apartment living factors: motor decibel ratings, folding footprint, deck cushioning, and vertical storage capabilities.

## 1. PureStride Compact 2.0 – Best Overall Apartment Treadmill
The PureStride Compact features an ultra-quiet 2.5 HP brushless motor that stays under 45 dB, making it neighbor-friendly for second-floor units. When folded, it measures just 6.5 inches deep and rolls smoothly under beds or sofas.`,
  );

  const [isRunning, setIsRunning] = useState(false);
  const [auditLog, setAuditLog] = useState<DecisionTreeAuditEntry[]>([]);
  const [terminalState, setTerminalState] = useState<TerminalState | null>(null);
  const [activeStep, setActiveStep] = useState<string>('IDLE');

  const handleRunPipeline = async () => {
    setIsRunning(true);
    setAuditLog([]);
    setTerminalState(null);
    setActiveStep('START');

    try {
      const state = await runDecisionTreePipeline({
        brief: {
          topicTitle,
          primaryKeyword,
          mustIncludePoints: mustInclude.split(',').map((s) => s.trim()).filter(Boolean),
          searchIntent: 'informational',
          existingDraft: sampleDraft,
        },
        draftText: sampleDraft,
        thresholds,
        onStepAudit: (entry, currentState) => {
          setAuditLog([...currentState.auditTrail]);
          setActiveStep(entry.nodeId);
        },
      });

      setTerminalState(state.terminalState ?? null);
    } catch (err) {
      console.error('Decision tree run error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const getTerminalBadge = (terminal: TerminalState | null) => {
    if (!terminal) return null;
    if (terminal === 'READY_AUTO_PUBLISH' || terminal === 'READY_FOR_SCHEDULING') {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 px-3 py-1">
          <CheckCircle2 className="h-4 w-4" />
          {terminal}
        </Badge>
      );
    }
    if (terminal.startsWith('HUMAN_REVIEW')) {
      return (
        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 px-3 py-1">
          <AlertTriangle className="h-4 w-4" />
          {terminal}
        </Badge>
      );
    }
    return (
      <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 px-3 py-1">
        <XCircle className="h-4 w-4" />
        {terminal}
      </Badge>
    );
  };

  return (
    <div className={`${DASHBOARD_SETTINGS_PANEL_CLASS} space-y-6 text-white`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <GitFork className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">Editorial Decision Tree &amp; Checker</h2>
            <Badge variant="outline" className="border-indigo-400/40 text-indigo-300 bg-indigo-500/10 text-xs">
              Liquid d1.1 + Gemini Pipeline
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-300">
            Liquid d1.1 handles rapid classification, quality gates, and fix routing. Gemini executes targeted content edits.
          </p>
        </div>
      </div>

      {/* Visual Pipeline Flowchart Overview */}
      <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Active Decision Tree Playbook</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          <div className={`p-2.5 rounded-lg border transition-colors ${activeStep.includes('INTAKE') ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'}`}>
            <span className="font-semibold block text-zinc-300">1. INTAKE</span>
            <span>Required fields</span>
          </div>
          <div className={`p-2.5 rounded-lg border transition-colors ${activeStep.includes('CONTENT_TYPE') ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'}`}>
            <span className="font-semibold block text-zinc-300">2. PROFILE</span>
            <span>Content profile</span>
          </div>
          <div className={`p-2.5 rounded-lg border transition-colors ${activeStep.includes('CORE') ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'}`}>
            <span className="font-semibold block text-zinc-300">3. CORE QA</span>
            <span>d1.1 Policy &amp; Brief</span>
          </div>
          <div className={`p-2.5 rounded-lg border transition-colors ${activeStep.includes('BRAND') ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'}`}>
            <span className="font-semibold block text-zinc-300">4. BRAND &amp; SEO</span>
            <span>d1.1 Voice Rubric</span>
          </div>
          <div className={`p-2.5 rounded-lg border transition-colors ${activeStep.includes('FIX') ? 'border-amber-500 bg-amber-500/20 text-white' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'}`}>
            <span className="font-semibold block text-zinc-300">5. FIX ROUTER</span>
            <span>Gemini Targeted Fix</span>
          </div>
          <div className={`p-2.5 rounded-lg border transition-colors ${activeStep.includes('PUBLISH') || terminalState ? 'border-emerald-500 bg-emerald-500/20 text-white' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400'}`}>
            <span className="font-semibold block text-zinc-300">6. TERMINAL</span>
            <span>Auto / Review / Reject</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Thresholds & Config */}
        <div className="lg:col-span-5 space-y-4">
          <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
            <div className="flex items-center gap-2 mb-3">
              <Sliders className="h-4 w-4 text-zinc-300" />
              <h3 className="text-sm font-semibold text-white">Configurable Policy Thresholds</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-zinc-300">Policy Safe Floor (Reject if below)</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.0"
                  max="1.0"
                  value={thresholds.policySafeFloor}
                  onChange={(e) => setThresholds({ ...thresholds, policySafeFloor: parseFloat(e.target.value) || 0.15 })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-zinc-300">On-Brief Min Probability</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.0"
                  max="1.0"
                  value={thresholds.onBriefFloor}
                  onChange={(e) => setThresholds({ ...thresholds, onBriefFloor: parseFloat(e.target.value) || 0.35 })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-zinc-300">Thin Content Min Score (0-3)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="3"
                  value={thresholds.thinContentFloor}
                  onChange={(e) => setThresholds({ ...thresholds, thinContentFloor: parseFloat(e.target.value) || 1.5 })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-zinc-300">Brand Voice Min Rubric Score (0-4)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="4"
                  value={thresholds.brandVoiceFloor}
                  onChange={(e) => setThresholds({ ...thresholds, brandVoiceFloor: parseFloat(e.target.value) || 2.0 })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-zinc-300">Auto-Publish Ready Gate Threshold</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.0"
                  max="1.0"
                  value={thresholds.publishReadyThreshold}
                  onChange={(e) => setThresholds({ ...thresholds, publishReadyThreshold: parseFloat(e.target.value) || 0.85 })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-zinc-300">Max Fix Loop Cap (before human escalation)</Label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={thresholds.maxFixLoops}
                  onChange={(e) => setThresholds({ ...thresholds, maxFixLoops: parseInt(e.target.value, 10) || 3 })}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Draft Test Simulator & Audit Stream */}
        <div className="lg:col-span-7 space-y-4">
          <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Live Decision Tree Simulator</h3>
              </div>
              <Button
                size="sm"
                onClick={handleRunPipeline}
                disabled={isRunning}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 flex items-center gap-1.5"
              >
                {isRunning ? <RotateCcw className="h-3.5 w-3.5 animate-pulse" /> : <Play className="h-3.5 w-3.5" />}
                {isRunning ? 'Evaluating...' : 'Run Decision Tree QA'}
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-300">Primary Keyword &amp; Title</Label>
                <Input
                  value={primaryKeyword}
                  onChange={(e) => setPrimaryKeyword(e.target.value)}
                  placeholder="Primary keyword"
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs h-8"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-300">Draft Content Excerpt</Label>
                <Textarea
                  rows={5}
                  value={sampleDraft}
                  onChange={(e) => setSampleDraft(e.target.value)}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white text-xs font-mono"
                />
              </div>

              {/* Terminal Verdict Banner */}
              {terminalState ? (
                <div className="p-3 rounded-lg border border-white/10 bg-zinc-950/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400 block">Final Tree Verdict:</span>
                    <span className="text-sm font-semibold text-white">{terminalState}</span>
                  </div>
                  <div>{getTerminalBadge(terminalState)}</div>
                </div>
              ) : null}

              {/* Audit Trail Log Stream */}
              {auditLog.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Info className="h-3.5 w-3.5" />
                    <span>Real-Time Audit Trail ({auditLog.length} steps):</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-black/60 border border-zinc-800/80 font-mono text-base">
                    {auditLog.map((entry, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-zinc-300">
                        <span className="text-zinc-500 shrink-0">[{entry.nodeId}]</span>
                        <span className="text-zinc-200">{entry.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
