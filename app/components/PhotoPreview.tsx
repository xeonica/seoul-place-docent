'use client';
import {useRef, useState} from 'react';
import {ArrowUpRight, Image as ImageIcon, Maximize2, X} from 'lucide-react';
import {photoResearchCredit, photoResearchImageCandidates, photoResearchText, photoResearchUrl, type PhotoResearchItem} from '@/lib/photo-research';
import './photo-preview.css';

export default function PhotoPreview({item, en = false}: {item: PhotoResearchItem; en?: boolean}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const candidates = photoResearchImageCandidates(item);
  const image = candidates[candidateIndex];
  const expanded = candidates[lightboxIndex];
  const title = photoResearchText(item.values['자료명'] || item.id);
  const credit = photoResearchCredit(item);
  const source = photoResearchUrl(item.sourceUrl || undefined);
  const date = item.values['촬영·제작일'] || item.values['역사적대상시기'];
  const location = item.values['촬영장소'] || item.values['촬영위치'] || item.values['촬영지'];
  const provider = item.values['제공기관·채널'] || item.provider;
  const terms = item.values['이용조건'];
  const original = en ? 'Open original record' : '자료 원문 열기';
  function open() {
    setLightboxIndex(candidateIndex);
    dialog.current?.showModal();
    close.current?.focus();
  }
  return <div className="research-photo-preview">
    {image ?
      <button ref={trigger} type="button" className="research-photo-open" aria-label={title + (en ? ' · Enlarge photo' : ' 사진 확대')} aria-haspopup="dialog" onClick={open}>
        <img src={image} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setCandidateIndex(index => index + 1)}/>
        <span className="research-photo-enlarge"><Maximize2 size={14}/>{en ? 'Enlarge photo' : '사진 확대'}</span>
      </button> : <div className="research-photo-placeholder"><ImageIcon size={28} strokeWidth={1.3}/>
        <span>{en ? 'The image is unavailable.' : '이 사진의 미리보기를 표시할 수 없어요.'}</span>
        {candidateIndex > 0 && <button type="button" onClick={() => setCandidateIndex(0)}>{en ? 'Reload photo' : '사진 다시 불러오기'}</button>}
        {source && <a href={source} target="_blank" rel="noopener noreferrer">{original}<ArrowUpRight size={13}/></a>}
      </div>}
    {!!candidates.length && <dialog ref={dialog} className="research-photo-dialog" aria-label={title}
      onClose={()=>trigger.current?.focus()}
      onClick={event => {if (event.target === event.currentTarget) dialog.current?.close();}}>
      <div className="research-photo-lightbox">
        <header><h2>{title}</h2><button ref={close} type="button" aria-label={en ? 'Close enlarged photo' : '확대 사진 닫기'} onClick={()=>dialog.current?.close()}><X size={22}/></button></header>
        {expanded ? <img key={expanded} src={expanded} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={()=>{if (dialog.current?.open) setLightboxIndex(index=>index+1);}}/> :
          <p className="research-photo-placeholder" role="status">{en ? 'This preview could not load. See the original record below.' : '확대 사진을 불러오지 못했어요. 아래 원문에서 확인해 주세요.'}</p>}
        <footer>
          <dl className="research-photo-metadata">
            <dt>{en ? 'Date or period' : '촬영 연도·자료 시기'}</dt><dd>{date ? photoResearchText(date) : (en ? 'Unknown' : '미상')}</dd>
            <dt>{en ? 'Photo location' : '촬영 위치'}</dt><dd>{location ? photoResearchText(location) : (en ? 'Unconfirmed' : '미확인')}</dd>
            <dt>{en ? 'Provider' : '제공 기관'}</dt><dd>{provider ? photoResearchText(provider) : (en ? 'Not recorded' : '미기재')}</dd>
            <dt>{en ? 'Terms' : '라이선스·이용 조건'}</dt><dd>{terms ? photoResearchText(terms) : (en ? 'Check the original record' : '원문에서 확인')}</dd>
          </dl>
          {credit && <p>{credit}</p>}
          {source && <a href={source} target="_blank" rel="noopener noreferrer">{original}<ArrowUpRight size={14}/></a>}
        </footer>
      </div>
    </dialog>}
  </div>;
}
