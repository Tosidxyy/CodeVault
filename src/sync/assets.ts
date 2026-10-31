import { validateDocument } from './protocol.ts';
import type { SyncDocument } from './protocol.ts';

export const maxAssetBytes = 2 * 1024 * 1024;
export const assetReference = /^codevault-asset:([a-f0-9]{64})$/;
export type WireDocument = SyncDocument; // images contain references, not data URLs
const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const signature = [137,80,78,71,13,10,26,10];
const crcTable=Uint32Array.from({length:256},(_value,index)=>{
  let crc=index;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);return crc>>>0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc=(crc>>>8)^crcTable[(crc^byte)&255];
  return (crc ^ 0xffffffff) >>> 0;
}
/** Structural PNG validation; does not inflate or render untrusted pixels. */
export function validatePng(bytes: Uint8Array): void {
  if (bytes.byteLength > maxAssetBytes || bytes.length < 45 || signature.some((n,i)=>bytes[i]!==n)) throw new Error('Invalid PNG or image exceeds 2MB');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let position=8, header=false, data=false, ended=false;
  while (position+12<=bytes.length) {
    const size=view.getUint32(position), end=position+12+size;
    if (end>bytes.length) throw new Error('Truncated PNG');
    const name=String.fromCharCode(...bytes.subarray(position+4,position+8));
    if (!/^[A-Za-z]{4}$/.test(name) || crc32(bytes.subarray(position+4,end-4))!==view.getUint32(end-4)) throw new Error('Invalid PNG chunk');
    if (!header) {
      if (name!=='IHDR' || size!==13) throw new Error('Missing PNG header');
      const width=view.getUint32(position+8),height=view.getUint32(position+12);
      if (!width || !height || width>8192 || height>8192 || width*height>16_777_216) throw new Error('PNG dimensions exceed limits');
      const depth=bytes[position+16],colour=bytes[position+17];
      const depths: Record<number,number[]> = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if (!depths[colour]?.includes(depth) || bytes[position+18]!==0 || bytes[position+19]!==0 || bytes[position+20]>1) throw new Error('Unsupported PNG header');
      header=true;
    } else if (name==='IHDR' || ['acTL','fcTL','fdAT'].includes(name)) throw new Error('Animated or duplicate PNG header');
    if (name==='IDAT') data=true;
    position=end;
    if (name==='IEND') { if (size!==0 || !data || position!==bytes.length) throw new Error('Invalid PNG ending'); ended=true; break; }
  }
  if (!ended) throw new Error('Incomplete PNG');
}
export async function assetHash(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function mapImages(document: SyncDocument, map: (value: string, path: string) => string): SyncDocument {
  const copy=structuredClone(document);
  copy.notes.forEach((note,index)=>{
    for (const [group,images] of [['images',note.images],['legacy',note.legacy?.images]] as const) {
      if (images===undefined) continue;
      if (!images || typeof images!=='object' || Array.isArray(images)) throw new Error('Invalid image map');
      for (const id of Object.keys(images)) images[id]=map(images[id],`${index}/${group}/${id}`);
    }
  });
  return copy;
}
export function validateWireDocument(id: string, value: unknown): WireDocument | null {
  if (value===null) return validateDocument(id,null);
  if (!value || typeof value!=='object' || !Array.isArray((value as SyncDocument).notes)) throw new Error('Invalid wire document');
  const refs=new Map<string,string>();
  const masked=mapImages(value as SyncDocument,(image,path)=>{
    if (typeof image!=='string' || !assetReference.test(image)) throw new Error('Upload images before syncing references');
    refs.set(path,image);return placeholder;
  });
  const validated=validateDocument(id,masked)!;
  return mapImages(validated,(_image,path)=>refs.get(path)!);
}
export function imageGroups(document: WireDocument | null): string[][] {
  if (!document) return [];
  return document.notes.flatMap(note=>[Object.values(note.images??{}),Object.values(note.legacy?.images??{})].map(images=>images.map(image=>{
    const match=assetReference.exec(image);if (!match) throw new Error('Invalid asset reference');return match[1];
  })));
}
export async function toWireDocument(id: string, value: SyncDocument | null): Promise<{document: WireDocument | null; assets: Map<string,Uint8Array>}> {
  const validated=validateDocument(id,value),assets=new Map<string,Uint8Array>();
  if (!validated) return {document:null,assets};
  const replacements=new Map<string,string>();
  const pending: {path:string;bytes:Uint8Array}[]=[];
  mapImages(validated,(image,path)=>{
    const bytes=Uint8Array.from(atob(image.slice(22)),c=>c.charCodeAt(0));validatePng(bytes);pending.push({path,bytes});return image;
  });
  for (const {path,bytes} of pending) { const hash=await assetHash(bytes);assets.set(hash,bytes);replacements.set(path,'codevault-asset:'+hash); }
  return {document:validateWireDocument(id,mapImages(validated,(_image,path)=>replacements.get(path)!)),assets};
}
export async function fromWireDocument(id: string, value: unknown, load: (hash:string)=>Promise<Uint8Array>): Promise<SyncDocument | null> {
  const wire=validateWireDocument(id,value);if (!wire) return null;
  const resolved=new Map<string,string>();
  for (const hash of new Set(imageGroups(wire).flat())) {
    const bytes=await load(hash);validatePng(bytes);
    if (await assetHash(bytes)!==hash) throw new Error('Image integrity check failed');
    const chunks:string[]=[];for(let offset=0;offset<bytes.length;offset+=32768)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
    resolved.set(hash,'data:image/png;base64,'+btoa(chunks.join('')));
  }
  // Enforces actual byte totals, including the independent legacy image group.
  return validateDocument(id,mapImages(wire,image=>resolved.get(assetReference.exec(image)![1])!));
}
