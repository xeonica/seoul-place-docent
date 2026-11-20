import type {Maps} from '../app/components/KakaoMapPanel';
let sdkPromise: Promise<Maps> | null = null;
export function loadSdk(): Promise<Maps> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const response = await fetch('/api/map-config', {signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('지도 설정을 불러오지 못했습니다.');
    const {javascriptKey} = await response.json() as {javascriptKey?: string};
    if (!javascriptKey) throw new Error('지도 JavaScript 키가 설정되지 않았습니다. 주소 검색 또는 외부 지도를 이용해 주세요.');
    return new Promise<Maps>((resolve, reject) => {
      const script = document.createElement('script'); let settled = false;
      const fail = () => {if (settled) return; settled = true; clearTimeout(timeout); script.remove(); reject(new Error('지도 SDK를 불러오지 못했습니다. JavaScript 키·등록 도메인·네트워크를 확인하거나 외부 지도를 이용해 주세요.'));};
      const timeout = setTimeout(fail, 18000);
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(javascriptKey)}&autoload=false`; script.async = true;
      script.onerror = fail; script.onload = () => {if (!window.kakao?.maps?.load) {fail(); return;} try{window.kakao.maps.load(() => {if (settled) return;if(!window.kakao?.maps||typeof window.kakao.maps.Map!=='function'||typeof window.kakao.maps.LatLng!=='function'){fail();return;} settled = true; clearTimeout(timeout); resolve(window.kakao!.maps);});}catch{fail();}};
      document.head.appendChild(script);
    });
  })().catch(error => {sdkPromise = null; throw error;});
  return sdkPromise;
}
