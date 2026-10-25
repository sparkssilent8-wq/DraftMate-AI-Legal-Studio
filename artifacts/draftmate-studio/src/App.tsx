import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AlertCircle, Archive, ArrowDownToLine, BookOpen, Check, ChevronRight, CircleHelp,
  Clipboard, FilePlus2, FileSearch, FileText, FolderOpen, Gavel, LoaderCircle, Mic,
  PenLine, Plus, Search, ShieldCheck, Sparkles, Upload, X, RotateCcw,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGenerateDraftmateDraft, useHealthCheck, useReviewDraftmateContract } from '@workspace/api-client-react';
import type { DraftmateReviewResult } from '@workspace/api-client-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const queryClient = new QueryClient();
type Skill = 'agreement-drafting' | 'legal-notice' | 'contract-review' | 'petition-outline' | 'legal-research' | 'document-summary';
type DraftRecord = { id: string; title: string; draft: string; skill: Skill; updatedAt: string; caveats?: string[] };
type ReferenceRecord = { id: string; name: string; text: string; addedAt: string };
type UploadTarget = 'contract' | 'support' | 'library';
type RecognizerLike = {
  lang: string; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void;
};
const skills: { value: Skill; label: string; short: string }[] = [
  { value: 'agreement-drafting', label: 'Agreement drafting', short: 'Agreement' },
  { value: 'legal-notice', label: 'Legal notice', short: 'Legal notice' },
  { value: 'contract-review', label: 'Contract review', short: 'Contract review' },
  { value: 'petition-outline', label: 'Petition outline', short: 'Petition' },
  { value: 'legal-research', label: 'Legal research', short: 'Research' },
  { value: 'document-summary', label: 'Document summary', short: 'Summary' },
];
const readLocal = <T,>(key: string, fallback: T): T => {
  try { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored) as T : fallback; } catch { return fallback; }
};
const stamp = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));

function Home() {
  const [location, setLocation] = useLocation();
  const generate = useGenerateDraftmateDraft();
  const review = useReviewDraftmateContract();
  const health = useHealthCheck();
  const section = location === '/references' ? 'references' : location === '/drafts' ? 'drafts' : 'workspace';
  const [mode, setMode] = useState<'review' | 'draft'>('review');
  const [skill, setSkill] = useState<Skill>('agreement-drafting');
  const [instruction, setInstruction] = useState('');
  const [contractText, setContractText] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [styleText, setStyleText] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [caveats, setCaveats] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>(() => readLocal('draftmate:drafts', []));
  const [references, setReferences] = useState<ReferenceRecord[]>(() => readLocal('draftmate:references', []));
  const [selectedSupportIds, setSelectedSupportIds] = useState<string[]>([]);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('contract');
  const [reviewResult, setReviewResult] = useState<DraftmateReviewResult | null>(null);
  const [resultStep, setResultStep] = useState<'findings' | 'revision'>('findings');
  const [activeDraftId, setActiveDraftId] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [voiceProposal, setVoiceProposal] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const recognizer = useRef<RecognizerLike | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { localStorage.setItem('draftmate:drafts', JSON.stringify(drafts)); }, [drafts]);
  useEffect(() => { localStorage.setItem('draftmate:references', JSON.stringify(references)); }, [references]);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [toast]);

  const persistDraft = (title = draftTitle, text = draftText, nextCaveats = caveats) => {
    if (!text.trim()) return;
    const id = activeDraftId || `draft-${Date.now()}`;
    setActiveDraftId(id);
    setDrafts((items) => [{ id, title: title.trim() || 'Untitled working draft', draft: text, skill, updatedAt: new Date().toISOString(), caveats: nextCaveats }, ...items.filter((item) => item.id !== id)]);
  };
  const newDraft = () => {
    setActiveDraftId(''); setDraftTitle(''); setDraftText(''); setCaveats([]);
    setReviewResult(null); setContractText(''); setInstruction(''); setErrorMessage('');
    setReferenceName(''); setReferenceText('');
    setSelectedSupportIds([]);
    setMode('review'); setLocation('/');
  };
  const openDraft = (item: DraftRecord) => {
    setActiveDraftId(item.id); setDraftTitle(item.title); setDraftText(item.draft);
    setCaveats(item.caveats || []); setSkill(item.skill); setReviewResult(null); setMode('draft'); setLocation('/');
  };
  const addReference = (name: string, text: string, loadIntoDraft = false) => {
    const next: ReferenceRecord = { id: `ref-${Date.now()}`, name, text, addedAt: new Date().toISOString() };
    setReferences((items) => [next, ...items]);
    if (loadIntoDraft) { setReferenceName(name); setReferenceText(text); }
    return next;
  };
  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!(/\.(txt|md|csv|html?|pdf|docx)$/i.test(file.name) || file.type.startsWith('text/'))) {
      setToast('Choose a PDF, DOCX, plain-text, Markdown, CSV, or HTML file');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    try {
      let text = '';
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages: string[] = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n); const content = await page.getTextContent();
          pages.push((content.items as Array<{ str?: string; hasEOL?: boolean }>).map((item) => `${item.str ?? ''}${item.hasEOL ? '\n' : ' '}`).join('').trim());
        }
        text = pages.join('\n\n');
      } else if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')) {
        text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      } else text = await file.text();
      if (!text.trim()) { setToast('No readable text found. Scanned documents require OCR.'); return; }
      if (uploadTarget === 'contract') {
        setContractText(text.slice(0, 100000));
        setReviewResult(null); setResultStep('findings'); setMode('review'); setLocation('/');
        setToast(text.length > 100000 ? 'Contract loaded; only the first 100,000 characters are available.' : 'Contract loaded into the review workspace');
      } else {
        const saved = addReference(file.name, text.slice(0, 18000), uploadTarget === 'support' && mode === 'draft');
        if (uploadTarget === 'support' && selectedSupportIds.length < 8) {
          setSelectedSupportIds((items) => items.includes(saved.id) ? items : [...items, saved.id]);
        }
        setToast(text.length > 18000
          ? 'Saved to your local library; only the first 18,000 characters are available.'
          : uploadTarget === 'support' && selectedSupportIds.length >= 8
            ? 'Saved locally. Choose up to eight supporting materials for a review.'
            : uploadTarget === 'support'
              ? 'Supporting material saved and selected for this review'
              : 'Saved to your local reference library');
      }
    } catch { setToast('Could not read that file'); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  };
  const runReview = () => {
    setErrorMessage(''); setReviewResult(null);
    const supportingMaterials = references.filter((item) => selectedSupportIds.includes(item.id) && item.text.trim()).slice(0, 8).map(({ name, text }) => ({ name, text: text.slice(0, 20000) }));
    review.mutate({ data: {
      contractText: contractText.trim(),
      ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
      ...(jurisdiction.trim() ? { jurisdiction: jurisdiction.trim() } : {}),
      ...(referenceText.trim() ? { referenceAgreementText: referenceText.slice(0, 40000) } : {}),
      ...(supportingMaterials.length ? { supportingMaterials } : {}),
    } }, {
      onSuccess: (result) => {
        setReviewResult(result); setResultStep('findings');
        setDraftTitle(result.title); setDraftText(result.revisedDraft); setSkill('contract-review');
        const id = `draft-${Date.now()}`; setActiveDraftId(id);
        setDrafts((items) => [{ id, title: result.title, draft: result.revisedDraft, skill: 'contract-review', updatedAt: new Date().toISOString(), caveats: result.assumptions }, ...items]);
        setToast('Review complete. Revised draft saved locally.');
      },
      onError: (error) => setErrorMessage(`Review could not be completed. ${error instanceof Error ? error.message : 'Try again.'}`),
    });
  };
  const generateDraft = () => {
    setErrorMessage('');
    generate.mutate({ data: { skill, instruction: instruction.trim(), ...(referenceText.trim() ? { referenceText: referenceText.slice(0, 18000) } : {}), ...(styleText.trim() ? { styleText: styleText.slice(0, 8000) } : {}) } }, {
      onSuccess: (result) => {
        const id = `draft-${Date.now()}`;
        setActiveDraftId(id); setDraftTitle(result.title); setDraftText(result.draft); setCaveats(result.caveats || []);
        setDrafts((items) => [{ id, title: result.title, draft: result.draft, skill, updatedAt: new Date().toISOString(), caveats: result.caveats || [] }, ...items]);
        setToast('Working draft saved locally');
      },
      onError: (error) => setErrorMessage(`Draft generation failed. ${error instanceof Error ? error.message : 'Try again.'}`),
    });
  };
  const startVoice = () => {
    const browserWindow = window as Window & { SpeechRecognition?: new () => RecognizerLike; webkitSpeechRecognition?: new () => RecognizerLike };
    const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { setToast('Voice input is not available in this browser'); return; }
    try {
      const session = new SpeechRecognition(); session.lang = 'en-US'; session.interimResults = false;
      session.onresult = (event) => { const text = event.results[0]?.[0]?.transcript?.trim(); if (text) setVoiceProposal(text); };
      session.onerror = () => { setIsListening(false); setToast('Voice input ended without a transcript'); };
      session.onend = () => setIsListening(false); recognizer.current = session; setIsListening(true); session.start();
    } catch { setIsListening(false); setToast('Could not start voice input'); }
  };
  const copyDraft = async () => {
    if (!draftText) { setToast('There is no draft to copy yet'); return; }
    try { await navigator.clipboard.writeText(`${draftTitle}\n\n${draftText}`); setToast('Draft copied to clipboard'); }
    catch { setToast('Clipboard access is unavailable'); }
  };
  const downloadDraft = () => {
    if (!draftText) { setToast('There is no draft to export yet'); return; }
    const blob = new Blob([`${draftTitle}\n\n${draftText}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${(draftTitle || 'legal-draft').replace(/[^\w-]+/g, '-').toLowerCase()}.txt`; anchor.click(); URL.revokeObjectURL(url);
    setToast('Draft exported as a text file');
  };
  const deleteDraft = (id: string) => {
    setDrafts((items) => items.filter((item) => item.id !== id));
    if (activeDraftId === id) { setActiveDraftId(''); setDraftTitle(''); setDraftText(''); }
    setToast('Draft removed from this browser');
  };
  const deleteReference = (id: string) => {
    setReferences((items) => items.filter((item) => item.id !== id));
    setSelectedSupportIds((items) => items.filter((item) => item !== id));
    setToast('Reference removed from this browser');
  };
  const useReference = (item: ReferenceRecord) => { setReferenceName(item.name); setReferenceText(item.text); setToast('Reference loaded into this session'); setLocation('/'); };
  const openFilePicker = (target: UploadTarget) => { setUploadTarget(target); fileInput.current?.click(); };
  const toggleSupportingMaterial = (id: string) => {
    if (selectedSupportIds.includes(id)) {
      setSelectedSupportIds((items) => items.filter((item) => item !== id));
    } else if (selectedSupportIds.length >= 8) {
      setToast('Choose up to eight supporting materials');
    } else {
      setSelectedSupportIds((items) => items.includes(id) ? items : [...items, id]);
    }
  };
  const visibleDrafts = drafts.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  const visibleReferences = references.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const connected = health.data?.status === 'ok' || health.data?.status === 'healthy';

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand"><div className="brand-mark"><Gavel size={18} /></div><div><div className="brand-name">DraftMate</div><div className="brand-sub">Legal work, with care</div></div></div>
      <div className="side-label">Workspace</div>
      <nav className="nav-list" aria-label="Workspace sections">
        <button className={`nav-button ${section === 'workspace' ? 'active' : ''}`} onClick={() => setLocation('/')} data-testid="nav-workspace"><PenLine size={17}/> Review workspace</button>
        <button className={`nav-button ${section === 'references' ? 'active' : ''}`} onClick={() => setLocation('/references')} data-testid="nav-references"><FolderOpen size={17}/> References <span className="nav-count">{references.length || ''}</span></button>
        <button className={`nav-button ${section === 'drafts' ? 'active' : ''}`} onClick={() => setLocation('/drafts')} data-testid="nav-drafts"><Archive size={17}/> Saved drafts <span className="nav-count">{drafts.length || ''}</span></button>
      </nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-note"><div className="review-chip"><ShieldCheck size={14}/> HUMAN REVIEW, ALWAYS</div>Source text grounds the work. It does not turn the assistant into legal authority.</div>
      <div className="sidebar-status"><span className={`status-dot ${health.isError ? 'offline' : ''}`}/>{health.isLoading ? 'Checking service' : health.isError ? 'Service unavailable' : connected ? 'Service connected' : 'Workspace ready'}</div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="crumb"><span>DraftMate</span><ChevronRight size={13}/><strong>{section === 'workspace' ? 'Review workspace' : section === 'references' ? 'Reference library' : 'Saved drafts'}</strong></div>
        <div className="top-actions"><div className="local-tag"><span className="local-dot"/> Stored in this browser</div><button className="icon-button" title="Review guidance" aria-label="Review guidance" onClick={() => setToast('DraftMate helps organize review and drafting. It does not provide legal advice or independently verify law.')}><CircleHelp size={16}/></button></div>
      </header>
      <div className="content-wrap">
        {section === 'workspace' ? <Workspace
          mode={mode} setMode={setMode} contractText={contractText} setContractText={setContractText}
          instruction={instruction} setInstruction={setInstruction} jurisdiction={jurisdiction} setJurisdiction={setJurisdiction}
          references={references} referenceText={referenceText} setReferenceText={setReferenceText} referenceName={referenceName} setReferenceName={setReferenceName}
           selectedSupportIds={selectedSupportIds} onToggleSupport={toggleSupportingMaterial}
          styleText={styleText} setStyleText={setStyleText} skill={skill} setSkill={setSkill}
          result={reviewResult} resultStep={resultStep} setResultStep={setResultStep}
          draftTitle={draftTitle} setDraftTitle={setDraftTitle} draftText={draftText} setDraftText={setDraftText}
          caveats={caveats} reviewPending={review.isPending} generatePending={generate.isPending}
          errorMessage={errorMessage} onReview={runReview} onGenerate={generateDraft} onNew={newDraft}
           onUploadContract={() => openFilePicker('contract')} onUploadSupporting={() => openFilePicker('support')}
           onVoice={isListening ? () => recognizer.current?.stop() : startVoice}
          isListening={isListening} onCopy={() => void copyDraft()} onExport={downloadDraft}
          onSave={() => { persistDraft(); setToast('Draft saved on this device'); }}
          drafts={drafts} onOpenDraft={openDraft} onOpenReferences={() => setLocation('/references')}
          setToast={setToast}
        /> : <Library section={section} search={search} setSearch={setSearch} drafts={visibleDrafts} references={visibleReferences}
           totalDrafts={drafts.length} onNew={newDraft} onUpload={() => openFilePicker('library')}
          onOpenDraft={openDraft} onDeleteDraft={deleteDraft} onDeleteReference={deleteReference} onUseReference={useReference}/>}
      </div>
    </main>
    {toast && <div className="toast-message" role="status" data-testid="status-toast">{toast}</div>}
    {errorMessage && section === 'workspace' && <div className="toast-message error-toast" role="alert">{errorMessage}<button onClick={() => setErrorMessage('')} aria-label="Dismiss error"><X size={13}/></button></div>}
    {voiceProposal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVoiceProposal(''); }}>
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="voice-title">
        <div className="eyebrow">VOICE INPUT</div><h2 id="voice-title">Review your transcript</h2><p>Choose how this recognized text should be used. Nothing is changed until you confirm.</p>
        <div className="transcript-box">{voiceProposal}</div><div className="modal-actions">
          <button onClick={() => setVoiceProposal('')}>Cancel</button>
          <button onClick={() => { setInstruction((text) => [text.trim(), voiceProposal].filter(Boolean).join('\n')); setVoiceProposal(''); setToast('Transcript added to your instruction'); }}>Add as instruction</button>
          <button className="confirm" onClick={() => { setDraftText(voiceProposal); persistDraft(draftTitle, voiceProposal); setVoiceProposal(''); setToast('Transcript replaced the draft text'); }}>Replace draft</button>
        </div>
      </section>
    </div>}
    <input ref={fileInput} type="file" accept=".txt,.md,.csv,.html,.htm,.pdf,.docx,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => void handleFile(event.target.files?.[0])} data-testid="input-document-file"/>
  </div>;
}

function Workspace(props: {
  mode: 'review' | 'draft'; setMode: (mode: 'review' | 'draft') => void;
  contractText: string; setContractText: (text: string) => void; instruction: string; setInstruction: (text: string) => void;
  jurisdiction: string; setJurisdiction: (text: string) => void; references: ReferenceRecord[];
  selectedSupportIds: string[]; onToggleSupport: (id: string) => void;
  referenceText: string; setReferenceText: (text: string) => void; referenceName: string; setReferenceName: (name: string) => void;
  styleText: string; setStyleText: (text: string) => void; skill: Skill; setSkill: (skill: Skill) => void;
  result: DraftmateReviewResult | null; resultStep: 'findings' | 'revision'; setResultStep: (step: 'findings' | 'revision') => void;
  draftTitle: string; setDraftTitle: (text: string) => void; draftText: string; setDraftText: (text: string) => void;
  caveats: string[]; reviewPending: boolean; generatePending: boolean; errorMessage: string;
  onReview: () => void; onGenerate: () => void; onNew: () => void; onUploadContract: () => void; onUploadSupporting: () => void; onVoice: () => void;
  isListening: boolean; onCopy: () => void; onExport: () => void; onSave: () => void;
  drafts: DraftRecord[]; onOpenDraft: (item: DraftRecord) => void; onOpenReferences: () => void; setToast: (text: string) => void;
}) {
  const wordCount = props.draftText.trim().split(/\s+/).filter(Boolean).length;
  return <>
    <div className="page-heading workspace-heading">
      <div><div className="eyebrow">DOCUMENT WORKFLOW / REVIEW → RISKS → REVISION</div><h1>Review before you revise.</h1><p className="page-intro">A source-grounded first pass on your contract. You stay the decision-maker.</p></div>
      <button className="subtle-button" onClick={props.onNew} data-testid="button-new-draft"><Plus size={14}/> New review</button>
    </div>
    <div className="workflow-steps" aria-label="Review workflow">
      <div className={`workflow-step ${!props.result ? 'current' : 'done'}`}><span>01</span><b>Contract</b><i/></div>
      <div className={`workflow-step ${props.result && props.resultStep === 'findings' ? 'current' : props.result ? 'done' : ''}`}><span>02</span><b>Risks & findings</b><i/></div>
      <div className={`workflow-step ${props.resultStep === 'revision' && props.result ? 'current' : ''}`}><span>03</span><b>Revised draft</b></div>
    </div>
    <div className="work-grid">
      <section className="panel input-panel" aria-label="Contract review input">
        <div className="panel-head"><div className="panel-title">Review brief</div><span className="panel-kicker">PRIVATE BY DEFAULT</span></div>
        <div className="mode-switch" role="tablist" aria-label="Workspace task">
          <button className={props.mode === 'review' ? 'selected' : ''} role="tab" aria-selected={props.mode === 'review'} onClick={() => props.setMode('review')}><FileSearch size={14}/> Contract review</button>
          <button className={props.mode === 'draft' ? 'selected' : ''} role="tab" aria-selected={props.mode === 'draft'} onClick={() => props.setMode('draft')}><PenLine size={14}/> Draft from brief</button>
        </div>
        {props.mode === 'review' ? <>
          <div className="field">
            <label className="field-label" htmlFor="contract-input">Contract text <small>REQUIRED · 100,000 CHAR MAX</small></label>
            <textarea id="contract-input" className="text-control contract-input" maxLength={100000} value={props.contractText} onChange={(event) => props.setContractText(event.target.value)} placeholder="Paste the agreement text you want to review…" data-testid="input-contract-text"/>
            <div className="input-foot"><span>{props.contractText.length.toLocaleString()} characters</span><button className="text-link" onClick={props.onUploadContract}><Upload size={12}/> Upload a contract</button></div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="review-instruction">Review focus <small>OPTIONAL</small></label>
            <textarea id="review-instruction" className="text-control review-brief-input" value={props.instruction} onChange={(event) => props.setInstruction(event.target.value)} maxLength={8000} placeholder="What should the review pay particular attention to?"/>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="jurisdiction-input">Jurisdiction context <small>OPTIONAL · USER-PROVIDED</small></label>
            <input id="jurisdiction-input" className="text-control jurisdiction-input" value={props.jurisdiction} onChange={(event) => props.setJurisdiction(event.target.value)} maxLength={300} placeholder="e.g. Ontario, Canada"/>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="reference-agreement">Reference agreement <small>OPTIONAL</small></label>
            <select id="reference-agreement" className="select-control" value={props.referenceName} onChange={(event) => {
              const selected = props.references.find((item) => item.name === event.target.value);
              props.setReferenceName(selected?.name || '');
              props.setReferenceText(selected?.text || '');
            }}>
              <option value="">No comparison agreement</option>{props.references.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <p className="field-note">Select a comparison agreement if you want its text included in this review.</p>
          </div>
          <div className="field">
            <div className="field-label"><span>Supporting materials</span><small>OPTIONAL · {props.selectedSupportIds.length}/8 SELECTED</small></div>
            <p className="field-note">Choose sources to compare with citations. Selected source text and any comparison agreement are sent only when you run this review.</p>
            {props.references.length ? <div className="support-source-list">
              {props.references.map((item) => {
                const checked = props.selectedSupportIds.includes(item.id);
                return <label className={`support-source-item ${checked ? 'checked' : ''}`} key={item.id}>
                  <input type="checkbox" checked={checked} disabled={!checked && props.selectedSupportIds.length >= 8} onChange={() => props.onToggleSupport(item.id)} aria-label={`Include ${item.name} as supporting material`}/>
                  <span className="support-source-copy"><b>{item.name}</b><small>{item.text.length.toLocaleString()} characters · stored in this browser</small></span>
                </label>;
              })}
            </div> : <p className="field-note">No supporting materials saved yet.</p>}
            <button className="upload-button support-upload" onClick={props.onUploadSupporting}><Upload size={13}/> Add supporting material</button>
          </div>
          <div className="privacy-note"><ShieldCheck size={14}/><span>Documents stay here unless you run a review. Then extracted text and your instructions are sent to the service.</span></div>
          <div className="generate-wrap"><button className="primary-button" disabled={props.contractText.trim().length < 20 || props.reviewPending} onClick={props.onReview} data-testid="button-run-review">
            {props.reviewPending ? <><LoaderCircle size={15} className="animate-spin"/> Reviewing contract…</> : <><Sparkles size={15}/> Review contract</>}
          </button><div className="secure-copy">Review notes are not legal advice or independent legal verification.</div></div>
        </> : <>
          <div className="field"><label className="field-label" htmlFor="skill-select">Drafting task <small>REQUIRED</small></label>
            <select id="skill-select" className="select-control" value={props.skill} onChange={(event) => props.setSkill(event.target.value as Skill)}>{skills.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </div>
          <div className="field"><label className="field-label" htmlFor="instruction-input">What should the draft do? <small>{props.instruction.length}/4000</small></label>
            <textarea id="instruction-input" className="text-control instruction-control" maxLength={4000} value={props.instruction} onChange={(event) => props.setInstruction(event.target.value)} placeholder="Describe the parties, purpose, key terms, jurisdiction, and outcome you need…"/>
          </div>
          <div className="field"><label className="field-label" htmlFor="reference-input">Reference material <small>OPTIONAL · 18,000 CHAR MAX</small></label>
            <textarea id="reference-input" className="text-control reference-control" maxLength={18000} value={props.referenceText} onChange={(event) => props.setReferenceText(event.target.value)} placeholder="Paste source excerpts or load a local reference."/>
            <div className="upload-row"><button className="upload-button" onClick={props.onUploadSupporting}><Upload size={13}/> Add a document</button>{props.referenceName && <span className="file-name">{props.referenceName}</span>}</div>
          </div>
          <div className="field"><label className="field-label" htmlFor="style-input">Style guide <small>OPTIONAL · 8,000 CHAR MAX</small></label><textarea id="style-input" className="text-control style-control" maxLength={8000} value={props.styleText} onChange={(event) => props.setStyleText(event.target.value)} placeholder="Paste a preferred clause, tone, or formatting example."/></div>
          <div className="generate-wrap"><button className="primary-button" disabled={!props.instruction.trim() || props.generatePending} onClick={props.onGenerate}>{props.generatePending ? <><LoaderCircle size={15} className="animate-spin"/> Preparing draft…</> : <><Sparkles size={15}/> Generate working draft</>}</button><div className="secure-copy">Selected text and instructions are sent only when you choose to generate.</div></div>
        </>}
      </section>
      <section className="panel results-panel" aria-label="Review results and revised draft">
        {props.result && props.mode === 'review' ? <ReviewResults {...props}/> : <DraftCanvas {...props} wordCount={wordCount}/>}
      </section>
      <aside className="right-column" aria-label="Review context">
        <section className="panel side-panel">
          <div className="panel-head"><div className="panel-title">Review principles</div><span className="panel-kicker">IMPORTANT</span></div>
          <div className="principle-list">
            <div><span className="principle-number">01</span><span><b>Source grounded</b><small>Findings reflect text provided for this review.</small></span></div>
            <div><span className="principle-number">02</span><span><b>Not verified law</b><small>Citation matches are not independent verification of authority.</small></span></div>
            <div><span className="principle-number">03</span><span><b>Your judgment leads</b><small>Confirm facts, obligations, and changes before use.</small></span></div>
          </div>
        </section>
        <section className="panel side-panel">
          <div className="panel-head"><div className="panel-title">Reference library</div><button className="tiny-action" onClick={props.onOpenReferences}>View all <ChevronRight size={12}/></button></div>
          {props.references.length ? <div className="doc-list">{props.references.slice(0, 3).map((item) => <button className="doc-row" key={item.id} onClick={() => { props.setReferenceText(item.text); props.setToast(`${item.name} loaded into this session`); }}><span className="doc-icon"><FileText size={14}/></span><span className="doc-row-copy"><span className="doc-name">{item.name}</span><span className="doc-sub">{item.text.length.toLocaleString()} CHAR · LOCAL</span></span></button>)}</div> : <div className="side-empty">Add a source to keep it available in this browser.</div>}
        </section>
        <section className="panel side-panel">
          <div className="panel-head"><div className="panel-title">Recent drafts</div><span className="panel-kicker">{props.drafts.length} SAVED</span></div>
          {props.drafts.length ? <div className="doc-list">{props.drafts.slice(0, 3).map((item) => <button className="doc-row" key={item.id} onClick={() => props.onOpenDraft(item)}><span className="doc-icon"><FileText size={14}/></span><span className="doc-row-copy"><span className="doc-name">{item.title}</span><span className="doc-sub">{stamp(item.updatedAt)}</span></span></button>)}</div> : <div className="side-empty">Your revised and generated drafts will be saved here.</div>}
        </section>
      </aside>
    </div>
  </>;
}

function DraftCanvas(props: ComponentProps<typeof Workspace> & { wordCount: number }) {
  return <>
    <div className="draft-toolbar"><div className="draft-status"><span className="local-dot"/>{props.draftText ? 'Editable working draft' : 'Draft canvas'}</div>
      <div className="draft-actions">
        <button className="tiny-action" onClick={props.onVoice} aria-label={props.isListening ? 'Stop voice input' : 'Start voice input'}>{props.isListening ? <><LoaderCircle size={13}/> Listening</> : <><Mic size={13}/> Dictate</>}</button>
        <button className="tiny-action" onClick={props.onSave}><Check size={13}/> Save</button>
        <button className="tiny-action" onClick={props.onCopy}><Clipboard size={13}/> Copy</button>
        <button className="tiny-action" onClick={props.onExport}><ArrowDownToLine size={13}/> Export</button>
      </div>
    </div>
    {props.draftText ? <div className="document-sheet">
      <input aria-label="Draft title" className="draft-title" value={props.draftTitle} onChange={(event) => props.setDraftTitle(event.target.value)} onBlur={props.onSave} placeholder="Untitled working draft"/>
      <div className="draft-meta"><span>{skills.find((item) => item.value === props.skill)?.short.toUpperCase()}</span><span>·</span><span>LOCAL WORKING COPY</span><span>·</span><span>{props.wordCount} WORDS</span></div>
      {props.caveats.length > 0 && <div className="caveat-list"><div className="caveat-heading"><AlertCircle size={13}/> Points to verify</div>{props.caveats.map((item, index) => <div className="caveat-item" key={`${index}-${item}`}>{item}</div>)}</div>}
      <textarea aria-label="Draft text" className="draft-body" value={props.draftText} onChange={(event) => props.setDraftText(event.target.value)} onBlur={props.onSave} placeholder="Your editable working draft appears here…"/>
      <div className="review-banner"><AlertCircle size={15}/><span><strong>Professional review required.</strong> Check all facts, authorities, dates, and obligations before relying on or sharing this document.</span></div>
    </div> : <div className="draft-empty"><div><div className="empty-mark"><FileText size={20}/></div><div className="empty-title">Your working document</div><p className="empty-copy">Run a contract review to see findings and a revised draft, or start from a drafting brief.</p><div className="canvas-skeleton"><span/><span/><span/><span/></div></div></div>}
  </>;
}

function ReviewResults(props: ComponentProps<typeof Workspace>) {
  const result = props.result;
  if (!result) return null;
  return <>
    <div className="result-header"><div><div className="eyebrow">CONTRACT REVIEW / COMPLETE</div><h2>{result.title}</h2><p>{result.overview}</p></div><button className="tiny-action" onClick={() => props.setResultStep(props.resultStep === 'findings' ? 'revision' : 'findings')}><RotateCcw size={13}/> {props.resultStep === 'findings' ? 'View revision' : 'Back to findings'}</button></div>
    <div className="result-tabs" role="tablist" aria-label="Review output">
      <button className={props.resultStep === 'findings' ? 'active' : ''} onClick={() => props.setResultStep('findings')} role="tab" aria-selected={props.resultStep === 'findings'}>Risks & findings <span>{result.findings.length}</span></button>
      <button className={props.resultStep === 'revision' ? 'active' : ''} onClick={() => props.setResultStep('revision')} role="tab" aria-selected={props.resultStep === 'revision'}>Revised draft</button>
    </div>
    {props.resultStep === 'findings' ? <div className="findings-content">
      <div className="finding-summary"><ShieldCheck size={16}/><span><b>Review notes, not legal conclusions.</b> Assess every suggested change against the full agreement and your context.</span></div>
      {result.findings.length ? result.findings.map((finding, index) => <article className={`finding-card severity-${finding.severity}`} key={finding.id}>
        <div className="finding-top"><span className={`severity-pill ${finding.severity}`}>{finding.severity} attention</span><span className="finding-index">FINDING {String(index + 1).padStart(2, '0')}</span></div>
        <h3>{finding.clause}</h3><blockquote>{finding.excerpt}</blockquote>
        <div className="finding-grid"><div><b>Observation</b><p>{finding.observation}</p></div><div><b>Potential concern</b><p>{finding.concern}</p></div>
          {finding.missingInformation && <div><b>Information to confirm</b><p>{finding.missingInformation}</p></div>}
          {finding.suggestedChange && <div><b>Suggested change</b><p>{finding.suggestedChange}</p></div>}
        </div>
      </article>) : <div className="side-empty large-empty">No specific findings were returned for the supplied contract. This is not a determination that the agreement is risk-free.</div>}
      {result.assumptions.length > 0 && <div className="assumptions-card"><b>Assumptions to confirm</b>{result.assumptions.map((item, i) => <p key={`${i}-${item}`}>{item}</p>)}</div>}
      <div className="citation-section"><div className="section-heading"><div><div className="eyebrow">PROVIDED MATERIAL ONLY</div><h3>Citation checks</h3></div><span className="not-verified"><AlertCircle size={12}/> Not independently verified</span></div>
        {result.citationChecks.length ? result.citationChecks.map((check, i) => <div className="citation-row" key={`${check.citation}-${i}`}>
          <span className={`citation-state ${check.status === 'matched_in_provided_material' ? 'matched' : ''}`}>{check.status === 'matched_in_provided_material' ? <Check size={13}/> : <AlertCircle size={13}/>}</span>
          <div><b>{check.citation}</b><small>{check.status === 'matched_in_provided_material' ? `Match in provided material${check.sourceName ? ` · ${check.sourceName}` : ''}` : check.status === 'not_found_in_provided_material' ? 'Not found in provided material' : 'Not checked against provided material'}</small>
            {check.matchedExcerpt && <blockquote>{check.matchedExcerpt}</blockquote>}</div>
        </div>) : <p className="field-note">No citation checks were returned for this review.</p>}
        <p className="citation-disclaimer">A match only indicates text found in the materials you supplied. It does not verify that a citation exists, is current, or states the law accurately.</p>
      </div>
      <button className="primary-button continue-button" onClick={() => props.setResultStep('revision')}>Continue to revised draft <ChevronRight size={15}/></button>
    </div> : <div className="revision-content">
      <div className="revision-note"><ShieldCheck size={15}/><span>Proposed working revision. Review edits against the original, confirm facts, and make your own legal judgment.</span></div>
      <div className="revision-toolbar"><span className="draft-status"><span className="local-dot"/> Editable local copy</span><div className="draft-actions">
        <button className="tiny-action" onClick={props.onVoice}>{props.isListening ? 'Listening' : <><Mic size={13}/> Dictate</>}</button><button className="tiny-action" onClick={props.onSave}><Check size={13}/> Save</button><button className="tiny-action" onClick={props.onCopy}><Clipboard size={13}/> Copy</button><button className="tiny-action" onClick={props.onExport}><ArrowDownToLine size={13}/> Export</button>
      </div></div>
      <input className="draft-title revision-title" aria-label="Revised draft title" value={props.draftTitle} onChange={(event) => props.setDraftTitle(event.target.value)} onBlur={props.onSave}/>
      <textarea className="draft-body revision-body" aria-label="Revised draft text" value={props.draftText} onChange={(event) => props.setDraftText(event.target.value)} onBlur={props.onSave}/>
      {result.changes.length > 0 && <div className="change-log"><h3>Revision notes</h3>{result.changes.map((change, i) => <details key={`${change.clause}-${i}`}><summary>{change.clause}<ChevronRight size={13}/></summary><div className="change-body"><p><b>Before</b>{change.before}</p><p><b>After</b>{change.after}</p><p><b>Reason</b>{change.reason}</p></div></details>)}</div>}
    </div>}
  </>;
}

function Library(props: {
  section: 'references' | 'drafts'; search: string; setSearch: (value: string) => void;
  drafts: DraftRecord[]; references: ReferenceRecord[]; totalDrafts: number;
  onNew: () => void; onUpload: () => void; onOpenDraft: (item: DraftRecord) => void;
  onDeleteDraft: (id: string) => void; onDeleteReference: (id: string) => void; onUseReference: (item: ReferenceRecord) => void;
}) {
  const isReferences = props.section === 'references';
  return <section className="library-view">
    <div className="page-heading"><div><div className="eyebrow">YOUR MATERIAL / {isReferences ? '02' : '03'}</div><h1>{isReferences ? 'Reference library.' : 'Saved drafts.'}</h1><p className="page-intro">{isReferences ? 'Source documents stored on this device for your review sessions.' : 'Working copies stay here until you choose to export them.'}</p></div>
      <button className="subtle-button" onClick={isReferences ? props.onUpload : props.onNew}>{isReferences ? <><Plus size={14}/> Add reference</> : <><Plus size={14}/> New draft</>}</button>
    </div>
    <div className="library-tools"><label className="search-wrap"><Search size={15}/><input className="search-input" value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder={`Search ${isReferences ? 'references' : 'drafts'}…`} aria-label={`Search ${props.section}`} data-testid="input-library-search"/></label><div className="local-tag"><span className="local-dot"/> Private to this browser</div></div>
    <div className="panel library-list">
      {isReferences ? props.references.length ? props.references.map((item) => <div className="library-item" key={item.id}>
        <div className="library-doc"><span className="doc-icon"><BookOpen size={15}/></span><div><div className="library-title">{item.name}</div><div className="library-info">{item.text.length.toLocaleString()} CHARACTERS · ADDED {stamp(item.addedAt)}</div></div></div>
        <div className="library-item-actions"><button className="subtle-button" onClick={() => props.onUseReference(item)}><FilePlus2 size={13}/> Use in review</button><button className="icon-button" aria-label={`Remove ${item.name}`} onClick={() => props.onDeleteReference(item.id)}><X size={14}/></button></div>
      </div>) : <div className="draft-empty"><div><div className="empty-mark"><FolderOpen size={19}/></div><div className="empty-title">No references saved yet.</div><p className="empty-copy">Add a PDF, Word file, or text document. It stays in this browser until you choose to send text for review.</p><button className="subtle-button empty-action" onClick={props.onUpload}><Upload size={13}/> Add a document</button></div></div>
      : props.drafts.length ? props.drafts.map((item) => <div className="library-item" key={item.id}>
        <button className="library-doc clickable-doc" onClick={() => props.onOpenDraft(item)}><span className="doc-icon"><FileText size={15}/></span><span><span className="library-title">{item.title}</span><span className="library-info">{skills.find((option) => option.value === item.skill)?.label.toUpperCase()} · UPDATED {stamp(item.updatedAt)}</span></span></button>
        <div className="library-item-actions"><button className="subtle-button" onClick={() => props.onOpenDraft(item)}><PenLine size={13}/> Open draft</button><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={() => props.onDeleteDraft(item.id)}><X size={14}/></button></div>
      </div>) : <div className="draft-empty"><div><div className="empty-mark"><Archive size={19}/></div><div className="empty-title">{props.search ? 'No matching drafts.' : 'No saved drafts yet.'}</div><p className="empty-copy">Review revisions and generated drafts are saved locally on this device.</p><button className="subtle-button empty-action" onClick={props.onNew}><Plus size={13}/> Start a review</button></div></div>}
    </div>
    <p className="library-footnote"><ShieldCheck size={13}/> Local browser storage only. Clearing browser data removes these working copies.</p>
  </section>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home}/><Route path="/drafts" component={Home}/><Route path="/references" component={Home}/><Route component={NotFound}/></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
