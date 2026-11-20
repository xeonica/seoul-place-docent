'use client';
import {useRef, useState} from 'react';
import {ArrowUpRight, Image as ImageIcon, Maximize2, X} from 'lucide-react';
import {photoResearchCredit, photoResearchImageCandidates, photoResearchText, type PhotoResearchItem} from '@/lib/photo-research';
import './photo-preview.css';

export default function PhotoPreview({item}: {item: PhotoResearchItem}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const candidates = photoResearchImageCandidates(item);
  const image = candidates[candidateIndex];
  const title = photoResearchText(item.values['자료명'] || item.id);
  const credit = photoResearchCredit(item);
  const source = item.sourceUrl || item.previewUrl;
  return <div className="research-photo-preview">
    {image ? <>
      <button type="button" className="research-photo-open" aria-label={title + ' 사진 확대'} onClick={() => dialog.current?.showModal()}>
        <img src={image} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setCandidateIndex(index => index + 1)}/>
        <span className="research-photo-enlarge"><Maximize2 size={14}/>사진 확대</span>
      </button>
      <dialog ref={dialog} className="research-photo-dialog" aria-label={title + ' 확대 보기'} onClick={event => {if (event.target === event.currentTarget) dialog.current?.close();}}>
        <div className="research-photo-lightbox">
          <header><h2>{title}</h2><button type="button" aria-label="확대 사진 닫기" onClick={() => dialog.current?.close()}><X size={22}/></button></header>
          <img src={image} alt={title} decoding="async" referrerPolicy="no-referrer"/>
          <footer><p>{credit}</p>{item.values['이용조건'] && <p>{photoResearchText(item.values['이용조건'])}</p>}{source && <a href={source} target="_blank" rel="noopener noreferrer">자료 원문 열기<ArrowUpRight size={14}/></a>}</footer>
        </div>
      </dialog>
    </> : <div className="research-photo-placeholder"><ImageIcon size={28} strokeWidth={1.3}/><span>{candidateIndex ? '사진 연결이 일시적으로 지연되고 있습니다' : '디지털 이미지가 연결되지 않은 기록입니다'}</span>{candidateIndex > 0 && <button type="button" onClick={() => setCandidateIndex(0)}>사진 다시 불러오기</button>}{source && <a href={source} target="_blank" rel="noopener noreferrer">자료 원문 열기<ArrowUpRight size={13}/></a>}</div>}
  </div>;
}
