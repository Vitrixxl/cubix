import { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { PUZZLES, puzzleId, puzzleInfo, type CubeSize } from '../../shared/puzzles';
import { cubeModelSelectionAtom, cubeSizeAtom, cubeSwitchLockedAtom, puzzleAtom } from '../state';
import { CUBE_MODEL_ASSETS, filterCubeReferences, loadCubeLibrary, productAssets, referenceImage, type CubeLibrary as Library, type CubeReference } from '../lib/cube-library';
import { FloatingSheet } from './FloatingSheet';
import { IconClose, IconHelp } from './icons';

export function CubeLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <FloatingSheet open={open} title="Cube library" className="cube-library" onClose={onClose}>
    <LibraryContent onClose={onClose} />
  </FloatingSheet>;
}

function LibraryContent({ onClose }: { onClose: () => void }) {
  const [library, setLibrary] = useState<Library | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState(''), [brand, setBrand] = useState(''), [puzzle, setPuzzle] = useState('');
  const [tab, setTab] = useState<'models' | 'products' | 'logos'>('models'), [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CubeReference | null>(null), [variant, setVariant] = useState(''), [imageIndex, setImageIndex] = useState(0);
  const [selections, setSelections] = useAtom(cubeModelSelectionAtom);
  const setActivePuzzle = useSetAtom(puzzleAtom);
  const size = useAtomValue(cubeSizeAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  useEffect(() => {
    let active = true; setError('');
    void loadCubeLibrary().then(data => { if (active) setLibrary(data); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [attempt]);
  const records = useMemo(() => tab === 'logos' ? library?.logos ?? [] : (library?.products ?? []).filter(record => tab !== 'models' || productAssets(record.id).length), [library, tab]);
  const brands = useMemo(() => [...new Set(records.map(record => record.brand))].sort(), [records]);
  const filtered = useMemo(() => filterCubeReferences(records, search, brand, tab !== 'logos' ? puzzle : ''), [records, search, brand, puzzle, tab]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 36));
  const currentPage = Math.min(page, pageCount - 1);
  const assets = selected ? productAssets(selected.id) : [];
  const asset = assets.find(asset => asset.variantId === variant);
  const choose = (record: CubeReference) => { setSelected(record); setVariant(productAssets(record.id)[0]?.variantId ?? record.variants[0]?.id ?? ''); setImageIndex(0); };
  const image = selected && (imageIndex === 0 ? referenceImage(selected, variant) : selected.images[imageIndex]?.url);
  return <>
    <header className="cube-library-header">
      <div><h1>Cube library</h1><span>{library ? `${CUBE_MODEL_ASSETS.length} 3D models · ${library.products.length.toLocaleString('en')} product references` : 'Loading references…'}</span></div>
      <a href="/guides/cube-models/" className="btn icon" aria-label="About cube models"><IconHelp /></a>
      <button type="button" className="btn icon" onClick={onClose} aria-label="Close cube library"><IconClose /></button>
    </header>
    <div className="cube-library-tabs" role="group" aria-label="Reference type">
      {(['models', 'products', 'logos'] as const).map(value => <button type="button" key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setBrand(''); setSelected(null); setPage(0); }}>{value === 'models' ? '3D models' : value === 'products' ? 'All references' : 'Logo references'}</button>)}
      <button type="button" className="cube-library-generic" disabled={locked} onClick={() => { setSelections({ ...selections, [size]: 'generic' }); onClose(); }}>Use generic {size}×{size}</button>
    </div>
    <div className="cube-library-filters">
      <input className="input" type="search" placeholder="Search model, version, finish…" aria-label="Search cube library" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
      <select className="input" aria-label="Filter brand" value={brand} onChange={event => { setBrand(event.target.value); setPage(0); }}><option value="">All brands</option>{brands.map(value => <option key={value}>{value}</option>)}</select>
      {tab !== 'logos' && <select className="input" aria-label="Filter puzzle" value={puzzle} onChange={event => { setPuzzle(event.target.value); setPage(0); }}><option value="">All puzzles</option>{PUZZLES.filter(value => tab !== 'models' || CUBE_MODEL_ASSETS.some(asset => String(asset.size).repeat(3) === value.id)).map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select>}
    </div>
    {error ? <div role="alert" className="cube-library-empty">{error}<button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <div className={`cube-library-body ${selected ? 'has-selection' : ''}`}>
      <div className="cube-library-results">
        <div className="cube-library-grid" aria-label="Reference results">
          {filtered.slice(currentPage * 36, (currentPage + 1) * 36).map(record => <button type="button" className={`cube-reference-card ${selected?.id === record.id ? 'selected' : ''}`} key={record.id} onClick={() => choose(record)} aria-pressed={selected?.id === record.id}>
            <ReferenceImage src={referenceImage(record)} alt={record.name} />
            <span className="cube-reference-brand">{record.brand}</span><strong>{record.name}</strong>
            <span className="cube-reference-status">{record.puzzle ? productAssets(record.id).length ? '3D available' : 'Photo reference' : 'Source artwork'}</span>
          </button>)}
          {library && !filtered.length && <div className="cube-library-empty">No matching references.</div>}
        </div>
        <footer className="cube-library-pagination"><span>{filtered.length.toLocaleString('en')} references</span><button type="button" className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous references">←</button><span>{currentPage + 1} / {pageCount}</span><button type="button" className="btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Next references">→</button></footer>
      </div>
      {selected && <aside className="cube-reference-detail" aria-label="Selected reference">
        <div className="cube-reference-detail-heading"><span>{selected.puzzle ? puzzleInfo(selected.puzzle).label : 'Logo reference'}</span><button type="button" className="btn icon" aria-label="Close reference" onClick={() => setSelected(null)}><IconClose /></button></div>
        <ReferenceImage key={image} src={image || undefined} alt={selected.name} />
        {selected.images.length > 1 && <div className="cube-reference-gallery" aria-label="Reference photos">{selected.images.map((img, index) => <button type="button" key={img.url} aria-label={`Photo ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}>{index + 1}</button>)}</div>}
        <span className="cube-reference-brand">{selected.brand}</span><h2>{selected.name}</h2>
        {asset?.reconstruction && <a className="cube-reference-status" href="/guides/cube-models/">Photo reconstruction · exterior surfaces</a>}
        {selected.variants.length > 0 && <label className="cube-reference-variant">Version<select className="input" value={variant} onChange={event => { setVariant(event.target.value); setImageIndex(0); }}>{selected.variants.map(v => <option key={v.id} value={v.id}>{v.name === 'Default Title' ? 'Standard' : v.name}</option>)}</select></label>}
        <a href={`${selected.source}?variant=${variant}`} target="_blank" rel="noreferrer" className="btn">View source ↗</a>
        {selected.puzzle && <button type="button" className="btn primary" disabled={!asset || locked} onClick={() => { if (!asset) return; setSelections({ ...selections, [asset.size]: asset.id }); setActivePuzzle(puzzleId(asset.size as CubeSize)); onClose(); }}>{asset ? 'Use this 3D model' : '3D model not yet available'}</button>}
      </aside>}
    </div>}
  </>;
}

function ReferenceImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className="cube-reference-image-missing">Image unavailable</div>;
}
