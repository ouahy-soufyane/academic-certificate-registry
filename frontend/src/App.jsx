import { useMemo, useState } from 'react';
import { BrowserProvider, Contract, isAddress, ZeroAddress } from 'ethers';
import * as XLSX from 'xlsx';
import { ArrowDownToLine, ArrowRight, BadgeCheck, BookOpen, Check, ChevronDown, CircleHelp, Clipboard, ExternalLink, FileSpreadsheet, Fingerprint, Globe2, GraduationCap, LoaderCircle, LockKeyhole, Menu, Plus, Search, ShieldCheck, Sparkles, Upload, Wallet, X } from 'lucide-react';
import contractConfig from './contract.json';

const emptyForm = { studentName: '', studentId: '', diplomaTitle: '', issueDate: '', grade: '', recipient: '' };
const columns = [
  ['studentName', 'Nom étudiant'], ['studentId', 'Identifiant'], ['diplomaTitle', 'Diplôme'],
  ['issueDate', 'Date émission'], ['grade', 'Mention'], ['recipientAddress', 'Wallet destinataire'],
];
const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
const contractReady = Boolean(contractConfig.address && contractConfig.abi?.length);
const contractInterface = contractConfig.abi;
const isISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function mintedIds(receipt, registry) {
  return receipt.logs.flatMap((log) => {
    try {
      const event = registry.interface.parseLog(log);
      return event?.name === 'CertificateMinted' ? [event.args.certId.toString()] : [];
    } catch {
      return [];
    }
  });
}

function App() {
  const [section, setSection] = useState('admin');
  const [account, setAccount] = useState('');
  const [networkOK, setNetworkOK] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState('');
  const [certificate, setCertificate] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');

  async function connectWallet() {
    if (!window.ethereum) { setMessage({ type: 'error', text: 'MetaMask est nécessaire. Installez l’extension, puis rechargez cette page.' }); return; }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const [address] = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();
      setAccount(address);
      setNetworkOK(Number(network.chainId) === contractConfig.chainId);
      setMessage(Number(network.chainId) === contractConfig.chainId ? null : { type: 'error', text: 'Le wallet est connecté, mais le réseau ne correspond pas au contrat. Sélectionnez Hardhat Local (31337).' });
    } catch (error) { setMessage({ type: 'error', text: readableError(error) }); }
  }

  async function getContract(write = false) {
    if (!window.ethereum) throw new Error('MetaMask est nécessaire.');
    if (!contractReady) throw new Error('Le contrat n’est pas encore déployé. Suivez les étapes du README.');
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== contractConfig.chainId) throw new Error('Mauvais réseau. Sélectionnez le réseau associé à ce contrat.');
    const signerOrProvider = write ? await provider.getSigner() : provider;
    return new Contract(contractConfig.address, contractInterface, signerOrProvider);
  }

  async function issueOne(event) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      if (form.recipient && !isAddress(form.recipient)) throw new Error('Adresse wallet invalide.');
      const studentName = form.studentName.trim();
      const studentId = form.studentId.trim();
      const registry = await getContract(true);
      const tx = await registry.mintCertificate(form.recipient.trim() || ZeroAddress, studentName, studentId, form.diplomaTitle.trim(), form.issueDate, form.grade.trim());
      setMessage({ type: 'pending', text: `Transaction envoyée : ${short(tx.hash)}`, hash: tx.hash });
      const receipt = await tx.wait();
      const [certId] = mintedIds(receipt, registry);
      setForm(emptyForm);
      setMessage({ type: 'success', text: certId ? `Certificat n° ${certId} émis pour ${studentName} (${studentId}).` : 'Le certificat a été émis avec succès.', hash: tx.hash });
    } catch (error) { setMessage({ type: 'error', text: readableError(error) }); }
    finally { setBusy(false); }
  }

  async function loadFile(file) {
    setMessage(null);
    try {
      const data = await file.arrayBuffer();
      const book = XLSX.read(data, { type: 'array', cellDates: false, raw: true, dateNF: 'yyyy-mm-dd' });
      const sheet = book.Sheets[book.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!parsed.length) throw new Error('Le fichier ne contient aucune ligne.');
      const normalized = parsed.map((item, index) => {
        const row = Object.fromEntries(Object.entries(item).map(([key, value]) => [String(key).trim(), String(value ?? '').trim()]));
        const issues = [];
        if (!row.studentName) issues.push('nom manquant');
        if (!row.studentId) issues.push('identifiant manquant');
        if (!row.diplomaTitle) issues.push('diplôme manquant');
        if (!isISODate(row.issueDate)) issues.push('date invalide (AAAA-MM-JJ)');
        if (row.recipientAddress && !isAddress(row.recipientAddress)) issues.push('wallet invalide');
        return { ...row, _row: index + 2, _error: issues.join(' · '), _selected: issues.length === 0 };
      });
      const seen = new Set();
      normalized.forEach((row) => {
        if (row.studentId && seen.has(row.studentId)) { row._error = [row._error, 'identifiant répété dans le fichier'].filter(Boolean).join(' · '); row._selected = false; }
        seen.add(row.studentId);
      });
      setRows(normalized); setSelected(Object.fromEntries(normalized.map((row, i) => [i, row._selected])));
      const invalidCount = normalized.filter((row) => row._error).length;
      setMessage({ type: invalidCount ? 'warning' : 'success', text: `${normalized.length} ligne${normalized.length > 1 ? 's' : ''} importée${normalized.length > 1 ? 's' : ''} · ${invalidCount} à corriger avant émission.` });
    } catch (error) { setRows([]); setMessage({ type: 'error', text: error.message || 'Impossible de lire ce fichier.' }); }
  }

  async function loadSampleCsv() {
    try {
      const response = await fetch('/etudiants-exemple.csv');
      if (!response.ok) throw new Error('Impossible de charger le CSV exemple.');
      await loadFile(await response.blob());
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Impossible de charger le CSV exemple.' });
    }
  }

  async function issueBatch() {
    const chosen = rows.filter((_, i) => selected[i]);
    if (!chosen.length) return;
    setBusy(true); setMessage(null);
    try {
      const registry = await getContract(true);
      const receipts = [];
      const certificateIds = [];
      for (let start = 0; start < chosen.length; start += 10) {
        const batch = chosen.slice(start, start + 10);
        const tx = await registry.batchMint(
          batch.map((r) => r.recipientAddress || ZeroAddress), batch.map((r) => r.studentName), batch.map((r) => r.studentId),
          batch.map((r) => r.diplomaTitle), batch.map((r) => r.issueDate), batch.map((r) => r.grade || '—'),
        );
        setMessage({ type: 'pending', text: `Lot ${Math.floor(start / 10) + 1} envoyé · ${short(tx.hash)}`, hash: tx.hash });
        const receipt = await tx.wait();
        receipts.push(tx.hash);
        certificateIds.push(...mintedIds(receipt, registry));
      }
      const range = certificateIds.length
        ? certificateIds[0] === certificateIds.at(-1) ? `Numéro : ${certificateIds[0]}.` : `Numéros : ${certificateIds[0]} à ${certificateIds.at(-1)}.`
        : '';
      setMessage({ type: 'success', text: `${chosen.length} certificat${chosen.length > 1 ? 's' : ''} émis. ${range}`, hashes: receipts });
      setRows([]); setSelected({});
    } catch (error) { setMessage({ type: 'error', text: readableError(error) }); }
    finally { setBusy(false); }
  }

  async function searchCertificate(event) {
    event.preventDefault(); setLookupError(''); setCertificate(null);
    if (!/^\d+$/.test(lookup.trim()) || Number(lookup) < 1) { setLookupError('Entrez un identifiant numérique valide.'); return; }
    setLookupBusy(true);
    try {
      const registry = await getContract(false); const result = await registry.getCertificate(lookup.trim());
      setCertificate({ studentName: result.studentName, studentId: result.studentId, diplomaTitle: result.diplomaTitle, issueDate: result.issueDate, grade: result.grade, recipient: result.recipient, revoked: result.revoked });
    } catch (error) { setLookupError(readableError(error)); }
    finally { setLookupBusy(false); }
  }

  const validSelected = useMemo(() => rows.filter((row, index) => selected[index] && !row._error).length, [rows, selected]);
  const invalidCount = rows.filter((row) => row._error).length;
  const transactionHashes = message?.hashes || (message?.hash ? [message.hash] : []);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setSection('admin'); }}><span className="brand-icon"><GraduationCap size={19} /></span><span className="brand-name">diploma<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">ESPACE DE TRAVAIL</div>
      <button className={`nav-item ${section === 'admin' ? 'active' : ''}`} onClick={() => setSection('admin')}><span className="nav-icon"><BookOpen size={17} /></span>Émission<span className="nav-indicator" /></button>
      <button className={`nav-item ${section === 'public' ? 'active' : ''}`} onClick={() => setSection('public')}><span className="nav-icon"><Globe2 size={17} /></span>Vérification publique<span className="nav-indicator" /></button>
      <div className="sidebar-bottom">
        <div className="chain-card"><span className="chain-pulse"/><div><strong>Réseau local</strong><span>Hardhat · Testnet privé</span></div><ChevronDown size={15} /></div>
        <div className="profile-row"><div className="avatar">UA</div><div className="profile-copy"><strong>Université Atlas</strong><span>Administrateur</span></div><button className="icon-button" title="Aide" onClick={() => setMessage({ type: 'info', text: 'Connectez MetaMask au réseau Hardhat local pour émettre. Le README contient les étapes illustrées.' })}><CircleHelp size={17}/></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Université Atlas</span><span className="crumb-sep">/</span><strong>{section === 'admin' ? 'Émission des diplômes' : 'Vérification publique'}</strong></div><div className="top-actions"><div className="network-pill"><span className="chain-pulse"/>Hardhat local</div><button className={`connect-button ${account ? 'connected' : ''}`} onClick={connectWallet}><Wallet size={16}/>{account ? short(account) : 'Connecter un wallet'}{account && <Check size={14}/>}</button></div></header>
      <div className="page-content">
        {section === 'admin' ? <>
          <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> REGISTRE ACADÉMIQUE</div><h1>Émission des diplômes</h1><p>Créez des certificats numériques vérifiables, en quelques instants.</p></div><div className="heading-badge"><ShieldCheck size={16}/><span>Certificats sécurisés<br/><strong>sur la blockchain</strong></span></div></div>
          {!contractReady && <div className="setup-banner"><div className="setup-icon"><LockKeyhole size={18}/></div><div><strong>Encore une étape avant votre première émission</strong><p>Lancez le réseau local puis le déploiement avec les commandes indiquées dans le README.</p></div><span className="setup-number">01—02</span></div>}
          <div className="tabs"><button className="tab active"><Plus size={15}/>Nouveau certificat</button><span className="tab-divider"/><button className="tab muted" onClick={() => document.getElementById('import-zone')?.scrollIntoView({ behavior: 'smooth' })}><FileSpreadsheet size={15}/>Import en lot</button></div>
          <section className="panel single-panel"><div className="panel-top"><div className="panel-title-group"><span className="panel-index">01</span><div><h2>Certificat individuel</h2><p>Renseignez les informations du diplôme à émettre.</p></div></div><span className="secure-label"><LockKeyhole size={12}/> SIGNATURE ADMIN</span></div>
            <form onSubmit={issueOne} className="certificate-form">
              <div className="form-grid"><Field label="Nom complet de l’étudiant" required placeholder="Ex. Amina Benali" value={form.studentName} onChange={(value) => setForm({ ...form, studentName: value })}/><Field label="Identifiant étudiant (CNE)" required placeholder="Ex. 2023-INF-042" value={form.studentId} onChange={(value) => setForm({ ...form, studentId: value })}/><Field label="Diplôme / attestation" required placeholder="Ex. Licence Informatique" value={form.diplomaTitle} onChange={(value) => setForm({ ...form, diplomaTitle: value })}/><Field label="Date d’émission" required type="date" value={form.issueDate} onChange={(value) => setForm({ ...form, issueDate: value })}/><Field label="Mention / note" placeholder="Ex. Mention Bien" value={form.grade} onChange={(value) => setForm({ ...form, grade: value })}/><Field label="Wallet du destinataire" placeholder="0x… (facultatif)" value={form.recipient} onChange={(value) => setForm({ ...form, recipient: value })} hint="Laissez vide si l’étudiant n’a pas de wallet"/></div>
              <div className="form-footer"><span><span className="required-star">*</span> Champs obligatoires · Inscription permanente sur la chaîne</span><button className="primary-button" disabled={busy || !contractReady}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>}Émettre le certificat<ArrowRight size={15}/></button></div>
            </form>
          </section>
          <section className="panel import-panel" id="import-zone"><div className="panel-top"><div className="panel-title-group"><span className="panel-index">02</span><div><h2>Importer une liste</h2><p>Émettez plusieurs certificats à partir d’un fichier Excel ou CSV.</p></div></div><div className="sample-links"><button className="sample-link sample-load" onClick={loadSampleCsv}><FileSpreadsheet size={14}/>Charger le CSV d’exemple</button><a className="sample-link" href="/etudiants-exemple.xlsx" download><ArrowDownToLine size={14}/>Excel</a><a className="sample-link" href="/etudiants-exemple.csv" download><ArrowDownToLine size={14}/>CSV</a></div></div>
            <label className="dropzone"><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}/><span className="upload-icon"><Upload size={19}/></span><span className="drop-main">Glissez votre fichier ici <strong>ou parcourez</strong></span><span className="drop-help">.xlsx, .xls ou .csv · Colonnes : studentName, studentId, diplomaTitle, issueDate, recipientAddress, grade</span></label>
            {rows.length > 0 && <div className="import-preview"><div className="preview-head"><div><h3>Aperçu des données</h3><span>{rows.length} lignes · {invalidCount ? <em>{invalidCount} à vérifier</em> : 'Tout est prêt'}</span></div><button className="icon-button" onClick={() => { setRows([]); setSelected({}); }} title="Effacer l’import"><X size={16}/></button></div><div className="table-wrap"><table><thead><tr><th className="check-cell"><input aria-label="Tout sélectionner" type="checkbox" checked={validSelected > 0 && validSelected === rows.filter((r) => !r._error).length} onChange={(e) => setSelected(Object.fromEntries(rows.map((r, i) => [i, e.target.checked && !r._error])))}/></th><th>ÉTUDIANT</th><th>IDENTIFIANT</th><th>DIPLÔME</th><th>DATE</th><th>ÉTAT</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.studentId}-${i}`} className={row._error ? 'row-invalid' : ''}><td className="check-cell"><input type="checkbox" disabled={Boolean(row._error)} checked={Boolean(selected[i])} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}/></td><td>{row.studentName || '—'}</td><td className="mono">{row.studentId || '—'}</td><td>{row.diplomaTitle || '—'}</td><td>{row.issueDate || '—'}</td><td>{row._error ? <span className="status-bad" title={row._error}>À corriger</span> : <span className="status-good"><Check size={12}/> Prêt</span>}</td></tr>)}</tbody></table></div><div className="batch-footer"><span><strong>{validSelected}</strong> certificat{validSelected !== 1 ? 's' : ''} sélectionné{validSelected !== 1 ? 's' : ''} · lots de 10 maximum</span><button className="primary-button" disabled={!validSelected || busy || !contractReady} onClick={issueBatch}>{busy ? <LoaderCircle className="spin" size={16}/> : <Upload size={15}/>}Émettre la sélection<ArrowRight size={15}/></button></div></div>}
          </section>
          <div className="privacy-note"><Fingerprint size={15}/><span>Les données du certificat sont publiques sur la blockchain. Évitez d’y inscrire des informations sensibles.</span><a href="#public" onClick={(e) => { e.preventDefault(); setSection('public'); }}>Voir la vérification publique <ArrowRight size={13}/></a></div>
        </> : <PublicView lookup={lookup} setLookup={setLookup} certificate={certificate} error={lookupError} busy={lookupBusy} onSearch={searchCertificate} contractReady={contractReady} />}
      </div>
      <footer className="footer"><span>© 2026 Université Atlas</span><span><span className="footer-dot"/>Réseau local connecté</span><span>Registre de certificats académiques</span></footer>
    </main>
    {message && <div className={`toast ${message.type}`}><span className="toast-icon">{message.type === 'success' ? <Check size={16}/> : message.type === 'pending' ? <LoaderCircle className="spin" size={16}/> : message.type === 'error' ? <X size={16}/> : <CircleHelp size={16}/>}</span><span className="toast-content"><span>{message.text}</span>{transactionHashes.length > 0 && <div className="transaction-hashes">{transactionHashes.map((hash, index) => <div className="transaction-hash" key={`${hash}-${index}`}><code>{hash}</code>{contractConfig.chainId !== 31337 && <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">Voir la transaction <ExternalLink size={11}/></a>}</div>)}</div>}</span><button onClick={() => setMessage(null)}><X size={14}/></button></div>}
  </div>;
}

function Field({ label, required, placeholder, type = 'text', value, onChange, hint }) { return <label className="field"><span>{label}{required && <b className="required-star"> *</b>}</span><input type={type} required={required} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}/>{hint && <small>{hint}</small>}</label>; }

function PublicView({ lookup, setLookup, certificate, error, busy, onSearch, contractReady }) {
  return <div className="public-page"><div className="public-hero"><div className="public-orbit orbit-one"/><div className="public-orbit orbit-two"/><span className="public-icon"><ShieldCheck size={25}/></span><div className="eyebrow">VÉRIFICATION INDÉPENDANTE</div><h1>Un diplôme.<br/><span>Une preuve.</span></h1><p>Vérifiez l’authenticité d’un certificat académique directement sur la blockchain.</p><form className="search-card" onSubmit={onSearch}><label htmlFor="cert-search">Identifiant du certificat</label><div className="search-input-row"><Fingerprint size={18}/><input id="cert-search" inputMode="numeric" placeholder="Ex. 1" value={lookup} onChange={(e) => setLookup(e.target.value)}/><button disabled={busy || !contractReady}>{busy ? <LoaderCircle className="spin" size={17}/> : <Search size={17}/>}Vérifier</button></div>{error && <div className="search-error">{error}</div>}</form><div className="public-assurance"><span><LockKeyhole size={13}/> Données vérifiées on-chain</span><i/><span>Gratuit &amp; instantané</span></div></div>
    {certificate ? <div className="result-card"><div className="result-head"><div className="result-check"><BadgeCheck size={20}/></div><div><strong>Certificat authentique</strong><span>Enregistré sur la blockchain</span></div><span className={`result-status ${certificate.revoked ? 'revoked' : ''}`}><i/>{certificate.revoked ? 'Révoqué' : 'Valide'}</span></div><div className="result-divider"/><div className="result-grid"><div><small>ÉTUDIANT</small><strong>{certificate.studentName}</strong></div><div><small>DIPLÔME</small><strong>{certificate.diplomaTitle}</strong></div><div><small>DATE D’ÉMISSION</small><strong>{certificate.issueDate}</strong></div><div><small>IDENTIFIANT ÉTUDIANT</small><strong>{certificate.studentId}</strong></div><div><small>MENTION</small><strong>{certificate.grade || '—'}</strong></div><div><small>PORTEFEUILLE</small><strong className="mono">{certificate.recipient.toLowerCase() === ZeroAddress ? 'Non renseigné' : short(certificate.recipient)}</strong></div></div><div className="verification-foot"><ShieldCheck size={14}/>Les informations proviennent directement du contrat intelligent.</div></div> : <div className="public-bottom"><div><div className="bottom-icon"><Fingerprint size={18}/></div><strong>Authenticité garantie</strong><p>Chaque certificat est unique et protégé contre la falsification.</p></div><div><div className="bottom-icon"><Globe2 size={18}/></div><strong>Vérifiable partout</strong><p>Une preuve publique, accessible sans compte ni intermédiaire.</p></div><div><div className="bottom-icon"><Clipboard size={18}/></div><strong>Simple à utiliser</strong><p>Saisissez simplement le numéro figurant sur le certificat.</p></div></div>}
    {!contractReady && <div className="public-config"><CircleHelp size={15}/> Le contrat sera disponible après le déploiement local. Consultez le README.</div>}
  </div>;
}

function readableError(error) {
  const text = error?.shortMessage || error?.reason || error?.message || 'Une erreur est survenue.';
  if (/user rejected|denied transaction|ACTION_REJECTED/i.test(text)) return 'Transaction refusée dans le wallet.';
  if (/already has a certificate/i.test(text)) return 'Un certificat existe déjà pour cet identifiant étudiant.';
  if (/Only the owner/i.test(text)) return 'Seul le compte ayant déployé le contrat peut émettre ou révoquer.';
  if (/certificate not found/i.test(text)) return 'Aucun certificat ne porte cet identifiant.';
  if (/insufficient funds/i.test(text)) return 'Solde insuffisant sur ce réseau pour payer les frais.';
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

export default App;
