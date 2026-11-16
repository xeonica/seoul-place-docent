'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Pause, Play, Square} from 'lucide-react';

type Playback = 'idle' | 'starting' | 'playing' | 'paused' | 'error';
let stopActivePlayback: (() => void) | null = null;

export function stopDocentAudio() {
  stopActivePlayback?.();
}

function speechParts(text: string) {
  const words = text.trim().split(/\s+/).flatMap(word => word.match(/.{1,180}/gu) || []);
  const output: string[] = [];
  let part = '';
  for (const word of words) {
    if (part && part.length + word.length > 180) {
      output.push(part);
      part = '';
    }
    part += (part ? ' ' : '') + word;
  }
  if (part) output.push(part);
  return output;
}

export default function DocentAudio({text, lang = 'ko-KR', en = false}: {text: string; lang?: 'ko-KR' | 'en-US'; en?: boolean}) {
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [state, setState] = useState<Playback>('idle');
  const voice = voices.find(item => item.lang.replace('_','-').toLowerCase() === lang.toLowerCase())
    ?? voices.find(item => item.lang.toLowerCase().startsWith(lang.slice(0,2).toLowerCase()));

  const stop = useCallback(() => {
    if (stopActivePlayback === stop) stopActivePlayback = null;
    const active = utterance.current;
    utterance.current = null;
    if (active) window.speechSynthesis.cancel();
    setState('idle');
  },[]);

  useEffect(() => {
    const engine = window.speechSynthesis;
    const available = !!engine && typeof window.SpeechSynthesisUtterance === 'function';
    setSupported(available);
    if (!available) return;
    const update = () => setVoices(engine.getVoices());
    update();
    engine.addEventListener('voiceschanged', update);
    return () => engine.removeEventListener('voiceschanged', update);
  }, []);

  useEffect(() => {
    // A replaced explanation or address must not leave the previous utterance in the browser queue.
    setState('idle');
    return () => {
      const active = utterance.current;
      utterance.current = null;
      if (active) {
        stopActivePlayback = null;
        window.speechSynthesis.cancel();
      }
    };
  }, [text, lang]);

  function play() {
    if (!supported || !text.trim() || utterance.current) return;
    stopDocentAudio();
    const engine = window.speechSynthesis;
    const parts = speechParts(text);
    stopActivePlayback = stop;
    const finish = (status: Playback) => {
      utterance.current = null;
      if (stopActivePlayback === stop) stopActivePlayback = null;
      setState(status);
    };
    function speakPart(index: number) {
      const next = new SpeechSynthesisUtterance(parts[index]);
      next.lang = lang;
      if (voice) next.voice = voice;
      utterance.current = next;
      next.onstart = () => {if (utterance.current === next) setState('playing');};
      next.onend = () => {
        if (utterance.current !== next) return;
        if (index + 1 < parts.length) speakPart(index + 1);
        else finish('idle');
      };
      next.onerror = () => {if (utterance.current === next) finish('error');};
      try {engine.speak(next);} catch {finish('error');}
    }
    setState('starting');
    speakPart(0);
  }

  if (!text.trim() || supported === null) return null;
  if (!supported) return <p className="visit-note">{en ? 'Audio is unavailable in this browser.' : '이 브라우저에서는 음성 재생을 지원하지 않아요.'}</p>;
  const playing = state === 'starting' || state === 'playing' || state === 'paused';
  const labels = en
    ? {idle:'Ready',starting:'Starting audio',playing:'Playing',paused:'Paused',error:'Audio failed. Check your device voice settings.'}
    : {idle:'재생 대기',starting:'재생 준비 중',playing:'재생 중',paused:'일시정지됨',error:'재생하지 못했어요. 기기의 음성 설정을 확인해 주세요.'};
  return <div className="docent-audio" aria-label={en ? 'Audio guide' : '오디오 도슨트'}>
    <div className="docent-audio-controls">
      {!playing && <button type="button" onClick={play}><Play size={16}/>{en ? 'Listen to the guide' : '도슨트 해설 듣기'}</button>}
      {state === 'playing' && <button type="button" onClick={() => {window.speechSynthesis.pause(); setState('paused');}}><Pause size={16}/>{en ? 'Pause' : '일시정지'}</button>}
      {state === 'paused' && <button type="button" onClick={() => {window.speechSynthesis.resume(); setState('playing');}}><Play size={16}/>{en ? 'Resume' : '이어 듣기'}</button>}
      {playing && <button type="button" onClick={stop}><Square size={15}/>{en ? 'Stop' : '정지'}</button>}
      <span role="status">{labels[state]}</span>
    </div>
    {!voice && !en && <small className="visit-note">한국어 음성은 기기의 음성 설정에 따라 제공돼요.</small>}
  </div>;
}
