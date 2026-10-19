import { useCallback, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Modal, Segmented } from './ui';

type AspectKey = 'libre' | 'cuadrado' | 'carta' | 'ancho';
const ASPECTS: Record<AspectKey, { label: string; value?: number }> = {
  libre: { label: 'Libre' },
  cuadrado: { label: 'Cuadrado' },
  carta: { label: 'Carta', value: 11 / 8.5 },
  ancho: { label: '16:9', value: 16 / 9 },
};
ASPECTS.cuadrado.value = 1;

export interface CropOptions {
  title?: string;
  aspect?: AspectKey;
}

const FULL: PercentCrop = { unit: '%', x: 0, y: 0, width: 100, height: 100 };

function initialCrop(img: HTMLImageElement, aspect?: number): PercentCrop {
  if (!aspect) return FULL;
  return centerCrop(makeAspectCrop({ unit: '%', width: 100 }, aspect, img.naturalWidth, img.naturalHeight), img.naturalWidth, img.naturalHeight);
}

/** Recuadro (en %) que encierra lo que no es blanco ni transparente. */
function contentBox(img: HTMLImageElement): PercentCrop | null {
  try {
    const c = document.createElement('canvas');
    const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, c.width, c.height);
    const { data, width, height } = x.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++)
      for (let xx = 0; xx < width; xx++) {
        const i = (y * width + xx) * 4;
        if (data[i + 3] > 24 && (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240)) {
          if (xx < x0) x0 = xx;
          if (xx > x1) x1 = xx;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    if (x1 < x0) return null;
    const pad = 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    return { unit: '%', x: (x0 / width) * 100, y: (y0 / height) * 100, width: ((x1 - x0 + 1) / width) * 100, height: ((y1 - y0 + 1) / height) * 100 };
  } catch {
    return null;
  }
}

/** Genera el archivo recortado en la resolución original (PNG si la imagen puede tener transparencia). */
async function cropFile(img: HTMLImageElement, crop: PercentCrop, source: File): Promise<File> {
  const sx = (crop.x / 100) * img.naturalWidth, sy = (crop.y / 100) * img.naturalHeight;
  const sw = Math.max(1, (crop.width / 100) * img.naturalWidth), sh = Math.max(1, (crop.height / 100) * img.naturalHeight);
  // límite razonable para no subir imágenes enormes
  const k = Math.min(1, 3000 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k);
  c.height = Math.round(sh * k);
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const jpeg = source.type === 'image/jpeg';
  const blob: Blob = await new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo recortar la imagen'))), jpeg ? 'image/jpeg' : 'image/png', 0.92),
  );
  const base = source.name.replace(/\.[^.]+$/, '') || 'imagen';
  return new File([blob], `${base}.${jpeg ? 'jpg' : 'png'}`, { type: blob.type });
}

function CropModal(props: { file: File; options: CropOptions; onDone: (f: File | null) => void }) {
  const [url] = useState(() => URL.createObjectURL(props.file));
  const imgRef = useRef<HTMLImageElement>(null);
  const [aspectKey, setAspectKey] = useState<AspectKey>(props.options.aspect ?? 'libre');
  const [crop, setCrop] = useState<PercentCrop>(FULL);
  const [busy, setBusy] = useState(false);
  const aspect = ASPECTS[aspectKey].value;

  const changeAspect = (k: AspectKey) => {
    setAspectKey(k);
    if (imgRef.current) setCrop(initialCrop(imgRef.current, ASPECTS[k].value));
  };
  const close = (f: File | null) => {
    URL.revokeObjectURL(url);
    props.onDone(f);
  };
  const apply = async () => {
    if (!imgRef.current) return;
    setBusy(true);
    try {
      const full = crop.width >= 99.9 && crop.height >= 99.9;
      close(full ? props.file : await cropFile(imgRef.current, crop, props.file));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={() => close(null)} width={720} label="Recortar imagen">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h4>{props.options.title ?? 'Recortar imagen'}</h4>
        <Segmented className="seg-ev" value={aspectKey} options={(Object.keys(ASPECTS) as AspectKey[]).map((k) => ({ value: k, label: ASPECTS[k].label }))} onChange={changeAspect} label="Proporción" />
      </div>
      <div style={{ background: 'repeating-conic-gradient(#eceef4 0% 25%, #fff 0% 50%) 50% / 16px 16px', borderRadius: 12, display: 'flex', justifyContent: 'center', padding: 8 }}>
        <ReactCrop crop={crop} onChange={(_, pc) => setCrop(pc)} aspect={aspect} keepSelection ruleOfThirds>
          <img
            ref={imgRef}
            src={url}
            alt="Imagen a recortar"
            style={{ maxHeight: '55vh', maxWidth: '100%', display: 'block' }}
            onLoad={(e) => setCrop(initialCrop(e.currentTarget, aspect))}
          />
        </ReactCrop>
      </div>
      <p className="field-hint" style={{ margin: 0 }}>Arrastra el recuadro o sus esquinas para elegir la parte que quieres usar.</p>
      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <button
          type="button"
          className="link"
          onClick={() => {
            const box = imgRef.current && contentBox(imgRef.current);
            if (box) {
              setAspectKey('libre');
              setCrop(box);
            }
          }}
        >
          Quitar márgenes vacíos
        </button>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => close(props.file)}>Usar sin recortar</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={apply}>{busy ? 'Recortando…' : 'Recortar y usar'}</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Herramienta de recorte para cualquier imagen que se sube.
 * `await crop(file)` abre el editor y devuelve el archivo recortado (o null si se cancela).
 */
export function useImageCropper() {
  const [req, setReq] = useState<{ file: File; options: CropOptions; resolve: (f: File | null) => void } | null>(null);
  const crop = useCallback(
    (file: File, options: CropOptions = {}) =>
      new Promise<File | null>((resolve) => {
        // las imágenes SVG se usan tal cual (son vectoriales)
        if (file.type === 'image/svg+xml') return resolve(file);
        setReq({ file, options, resolve });
      }),
    [],
  );
  const element = req ? (
    <CropModal
      key={req.file.name + req.file.size}
      file={req.file}
      options={req.options}
      onDone={(f) => {
        req.resolve(f);
        setReq(null);
      }}
    />
  ) : null;
  return { crop, element };
}
