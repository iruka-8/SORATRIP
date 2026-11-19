import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import {
  CalendarDays, MapPin, Plus, Search, Trash2, Clock, Navigation,
  Plane, Heart, ImagePlus, X, NotebookPen, Route, ListChecks
} from 'lucide-react';
import './App.css';

type Day = { id: number; date: string };
type Place = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  day: number | null;
  memo: string;
  images: string[];
};
type Schedule = { id: number; day: number; time: string; title: string };

const DEFAULT_DAYS: Day[] = [
  { id: 1, date: '2026-12-01' },
  { id: 2, date: '2026-12-02' },
  { id: 3, date: '2026-12-03' }
];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function MapClick({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

function RouteLayer({ places, enabled }: { places: Place[]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || places.length < 2) return;

    const routing = (L as unknown as { Routing?: { control: (options: unknown) => L.Control } }).Routing;
    if (!routing) return;

    const control = routing.control({
      waypoints: places.map(place => L.latLng(place.lat, place.lng)),
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      show: false,
      collapsible: true,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [
          { color: '#4aaee0', opacity: 0.9, weight: 6 },
          { color: '#ffffff', opacity: 0.9, weight: 2 }
        ],
        extendToWaypoints: true,
        missingRouteTolerance: 10
      },
      createMarker: () => null
    });
    control.addTo(map);
    return () => { map.removeControl(control); };
  }, [map, places, enabled]);

  return null;
}

const pinIcon = L.divIcon({
  className: 'soratrip-pin',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

export default function App() {
  const [days, setDays] = useState<Day[]>(() => readStorage('sora-days', DEFAULT_DAYS));
  const [selectedDay, setSelectedDay] = useState<number>(() => readStorage('sora-selected-day', 1));
  const [places, setPlaces] = useState<Place[]>(() =>
    readStorage<Place[]>('sora-places', []).map(place => ({ ...place, images: place.images || [], day: place.day ?? null }))
  );
  const [schedules, setSchedules] = useState<Schedule[]>(() => readStorage('sora-schedules', []));
  const [showRoute, setShowRoute] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [placeMemo, setPlaceMemo] = useState('');
  const [includeInItinerary, setIncludeInItinerary] = useState(true);
  const [placeImages, setPlaceImages] = useState<string[]>([]);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { localStorage.setItem('sora-days', JSON.stringify(days)); }, [days]);
  useEffect(() => { localStorage.setItem('sora-selected-day', JSON.stringify(selectedDay)); }, [selectedDay]);
  useEffect(() => {
    try { localStorage.setItem('sora-places', JSON.stringify(places)); }
    catch { setNotice('写真の保存容量がいっぱいです。写真を減らすか、サイズを小さくしてください。'); }
  }, [places]);
  useEffect(() => { localStorage.setItem('sora-schedules', JSON.stringify(schedules)); }, [schedules]);

  const currentPlaces = useMemo(
    () => places.filter(place => place.day === selectedDay),
    [places, selectedDay]
  );
  const wishlistPlaces = places.filter(place => place.day === null);
  const currentSchedules = schedules
    .filter(item => item.day === selectedDay)
    .sort((a, b) => a.time.localeCompare(b.time));
  const albumItems = places.flatMap(place =>
    (place.images || []).map((image, index) => ({
      image, placeName: place.name, day: place.day, id: `${place.id}-${index}`
    }))
  );

  function addPlace(lat: number, lng: number, name = '') {
    setPendingPin({ lat, lng });
    setPlaceName(name);
    setPlaceMemo('');
    setPlaceImages([]);
    setIncludeInItinerary(true);
  }

  function savePlace() {
    if (!pendingPin || !placeName.trim()) {
      setNotice('スポット名を入力してください。');
      return;
    }
    const newPlace: Place = {
      id: Date.now(),
      name: placeName.trim(),
      lat: pendingPin.lat,
      lng: pendingPin.lng,
      day: includeInItinerary ? selectedDay : null,
      memo: placeMemo,
      images: placeImages
    };
    setPlaces(prev => [...prev, newPlace]);
    setPendingPin(null);
    setPlaceName('');
    setPlaceMemo('');
    setPlaceImages([]);
    setNotice('スポットを保存しました。');
  }

  function updatePlace(id: number, changes: Partial<Place>) {
    setPlaces(prev => prev.map(place => place.id === id ? { ...place, ...changes } : place));
  }

  function deletePlace(id: number) {
    setPlaces(prev => prev.filter(place => place.id !== id));
  }

  function handleImages(files: FileList | null, onDone: (images: string[]) => void) {
    if (!files) return;
    const selected = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (selected.some(file => file.size > 1.5 * 1024 * 1024)) {
      setNotice('画像は1枚1.5MB以下のものを選んでください。');
      return;
    }
    Promise.all(selected.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('画像を読み込めませんでした'));
      reader.readAsDataURL(file);
    }))).then(onDone).catch(() => setNotice('画像を読み込めませんでした。'));
  }

  async function searchPlace() {
    if (!searchText.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(searchText)}`;
      const response = await fetch(url);
      const results = await response.json();
      if (!results.length) {
        setNotice('場所が見つかりませんでした。別の名前で検索してください。');
      } else {
        addPlace(Number(results[0].lat), Number(results[0].lon), results[0].name.split(',')[0]);
        setNotice('地図に候補を表示しました。内容を確認して保存してください。');
      }
    } catch {
      setNotice('場所を検索できませんでした。地図をクリックして追加することもできます。');
    } finally {
      setSearching(false);
    }
  }

  function addSchedule() {
    if (!scheduleTitle.trim()) return;
    setSchedules(prev => [...prev, {
      id: Date.now(), day: selectedDay, time: scheduleTime, title: scheduleTitle.trim()
    }]);
    setScheduleTitle('');
  }

  function addDay() {
    const last = days[days.length - 1];
    const nextDate = new Date(`${last?.date || '2026-12-01'}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const date = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    const id = Date.now();
    setDays(prev => [...prev, { id, date }]);
    setSelectedDay(id);
  }
  function deleteDay(id: number) {
    if (days.length <= 1) {
      setNotice('日程は最低1日必要です。');
      return;
    }
  
    const index = days.findIndex(day => day.id === id);
  
    if (index === -1) return;
  
    const targetDay = days[index - 1] ?? days[index + 1];
  
    if (!targetDay) return;
  
    const deletedDay = days[index];
  
    const confirmed = window.confirm(
      `${deletedDay.date} の日程を削除しますか？\n登録済みのスポットと予定は、${targetDay.date} に移動します。`
    );
  
    if (!confirmed) return;
  
    setPlaces(prev =>
      prev.map(place =>
        place.day === id
          ? { ...place, day: targetDay.id }
          : place
      )
    );
  
    setSchedules(prev =>
      prev.map(schedule =>
        schedule.day === id
          ? { ...schedule, day: targetDay.id }
          : schedule
      )
    );
  
    setDays(prev => prev.filter(day => day.id !== id));
  
    if (selectedDay === id) {
      setSelectedDay(targetDay.id);
    }
  
    setNotice('日程を削除しました。');
  }
  function updateDayDate(id: number, date: string) {
    if (!date) return;
  
    setDays(prev =>
      prev.map(day =>
        day.id === id ? { ...day, date } : day
      )
    );
  
    setNotice('旅行日程の日付を変更しました。');
  }
  function moveToDay(id: number) {
    updatePlace(id, { day: selectedDay });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><Plane size={20} /></span><span>SoraTrip<small>YOUR JOURNEY, YOUR STORY</small></span></a>
        <div className="topbar-note">旅の計画を、もっと自由に。</div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div><span className="eyebrow">TRAVEL PLANNER</span><h1><em>わくわく</em>を計画しよう</h1><p>行きたい場所を地図にピン留めして
            旅程をつくろう。</p></div>
          <div className="hero-art"><Plane size={48} strokeWidth={1.2} /><span>✦</span><span>☁</span></div>
        </section>

        <section className="day-panel panel">
          <div className="section-heading"><div className="heading-icon"><CalendarDays size={19} /></div><div><h2>旅行日程</h2><p>日程を選択してスケジュールを管理</p></div><button className="soft-button add-day" onClick={addDay}><Plus size={15} /> 日程を追加</button></div>
          <div className="day-tabs">
  {<div className="day-tabs">
  {days.map((day, index) => (
    <div
      key={day.id}
      className={
        selectedDay === day.id
          ? 'day-tab-wrap active'
          : 'day-tab-wrap'
      }
    >
      <button
        className={
          selectedDay === day.id
            ? 'day-tab active'
            : 'day-tab'
        }
        onClick={() => setSelectedDay(day.id)}
      >
        <span>DAY {index + 1}</span>
        <strong>{day.date.replaceAll('-', '.')}</strong>
      </button>

      <label className="day-date-edit">
        <CalendarDays size={13} />
        日付を変更
        <input
          type="date"
          value={day.date}
          onChange={e =>
            updateDayDate(day.id, e.target.value)
          }
        />
      </label>

      <button
        type="button"
        className="delete-day-button"
        onClick={() => deleteDay(day.id)}
        disabled={days.length <= 1}
      >
        <Trash2 size={13} />
        この日程を削除
      </button>
    </div>
  ))}
</div>}
</div>
        </section>

        <div className="content-grid">
          <section className="panel map-panel">
            <div className="section-heading"><div className="heading-icon"><MapPin size={19} /></div><div><h2>旅のマップ</h2><p>地図をクリックしてスポットを追加できます</p></div><span className="count-pill">{currentPlaces.length} SPOTS</span></div>
            <div className="search-row"><Search size={17} /><input value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPlace()} placeholder="場所・施設名を検索" /><button onClick={searchPlace} disabled={searching}>{searching ? '検索中…' : '検索'}</button></div>
            <div className="map-toolbar"><p><MapPin size={13} /> 地図上をクリックしてピンを追加</p><button className={showRoute ? 'route-button active' : 'route-button'} onClick={() => setShowRoute(value => !value)}><Route size={15} />{showRoute ? 'ルートを非表示' : '道路ルートを表示'}</button></div>
            {showRoute && currentPlaces.length < 2 && <p className="route-notice">道路ルートを表示するには、同じ日程に2か所以上のスポットが必要です。</p>}
            <div className="map-wrap">
              <MapContainer center={[35.6812, 139.7671]} zoom={12} scrollWheelZoom>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClick onMapClick={(lat, lng) => addPlace(lat, lng)} />
                {places.map(place => (
                  <Marker key={place.id} position={[place.lat, place.lng]} icon={pinIcon}>
                    <Popup><strong>{place.name}</strong><br />{place.day === null ? '行きたい場所リスト' : `DAY ${days.findIndex(day => day.id === place.day) + 1}`}<br />{place.memo}</Popup>
                  </Marker>
                ))}
                {pendingPin && <Marker position={[pendingPin.lat, pendingPin.lng]}><Popup>新しいスポット候補</Popup></Marker>}
                <RouteLayer places={currentPlaces} enabled={showRoute} />
              </MapContainer>
            </div>
            <p className="map-footnote">地図データ：OpenStreetMap ／ 道路ルート：OSRM</p>
            {pendingPin && (
              <div className="new-place-form">
                <div className="form-title"><strong>新しいスポット</strong><button className="icon-button" onClick={() => setPendingPin(null)} aria-label="閉じる"><X size={17} /></button></div>
                <label>スポット名<input value={placeName} onChange={e => setPlaceName(e.target.value)} placeholder="例：東京タワー" /></label>
                <label>メモ<textarea value={placeMemo} onChange={e => setPlaceMemo(e.target.value)} placeholder="営業時間、行きたい理由、予約情報など…" rows={3} /></label>
                <label className="check-label"><input type="checkbox" checked={includeInItinerary} onChange={e => setIncludeInItinerary(e.target.checked)} /> 選択中の日程に追加する（チェックを外すと行きたい場所リストへ）</label>
                <label className="upload-label"><ImagePlus size={16} /> 写真を追加<input type="file" accept="image/*" multiple onChange={e => handleImages(e.target.files, images => setPlaceImages(prev => [...prev, ...images]))} /></label>
                {placeImages.length > 0 && <div className="preview-row">{placeImages.map((image, index) => <button key={index} onClick={() => setPlaceImages(prev => prev.filter((_, i) => i !== index))}><img src={image} alt="追加する写真" /><X size={13} /></button>)}</div>}
                <button className="primary-button full-button" onClick={savePlace}>スポットを保存</button>
              </div>
            )}
          </section>

          <aside className="side-column">
            <section className="panel schedule-panel">
              <div className="section-heading"><div className="heading-icon"><Clock size={19} /></div><div><h2>スケジュール</h2><p>DAY {Math.max(1, days.findIndex(day => day.id === selectedDay) + 1)} の予定</p></div></div>
              <div className="schedule-list">
                {currentSchedules.length === 0 ? <p className="empty-small">予定を追加して旅程を組み立てましょう。</p> : currentSchedules.map(item => <div className="schedule-item" key={item.id}><time>{item.time}</time><span>{item.title}</span><button onClick={() => setSchedules(prev => prev.filter(schedule => schedule.id !== item.id))} aria-label="予定を削除"><Trash2 size={14} /></button></div>)}
              </div>
              <div className="schedule-form"><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} /><input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSchedule()} placeholder="予定を入力" /><button onClick={addSchedule} aria-label="予定を追加"><Plus size={17} /></button></div>
            </section>

            <section className="panel places-panel">
              <div className="section-heading"><div className="heading-icon"><ListChecks size={19} /></div><div><h2>DAY {Math.max(1, days.findIndex(day => day.id === selectedDay) + 1)} のスポット</h2><p>登録した場所とメモ</p></div><span className="count-pill">{currentPlaces.length}</span></div>
              {currentPlaces.length === 0 ? <div className="empty-state"><MapPin size={26} /><p>まだスポットがありません</p><span>地図をクリックして追加してみましょう。</span></div> : currentPlaces.map(place => (
                <article className="place-card" key={place.id}>
                  <div className="place-card-head"><div><strong>{place.name}</strong><small>{place.lat.toFixed(4)}, {place.lng.toFixed(4)}</small></div><button onClick={() => deletePlace(place.id)} aria-label="スポットを削除"><Trash2 size={15} /></button></div>
                  <textarea value={place.memo} onChange={e => updatePlace(place.id, { memo: e.target.value })} placeholder="この場所のメモ…" rows={2} />
                  <div className="place-photos">{place.images.map((image, index) => <button key={index} onClick={() => setSelectedImage(image)}><img src={image} alt={place.name} /><span onClick={e => { e.stopPropagation(); updatePlace(place.id, { images: place.images.filter((_, i) => i !== index) }); }}><X size={12} /></span></button>)}</div>
                  <label className="mini-upload"><ImagePlus size={14} /> 写真を追加<input type="file" accept="image/*" multiple onChange={e => handleImages(e.target.files, images => updatePlace(place.id, { images: [...place.images, ...images] }))} /></label>
                </article>
              ))}
            </section>
          </aside>
        </div>

        <section className="panel wishlist-panel">
          <div className="section-heading"><div className="heading-icon"><Heart size={19} /></div><div><h2>行きたい場所リスト</h2><p>日程は未定だけど、気になるスポットを保存</p></div><span className="count-pill">{wishlistPlaces.length} SAVED</span></div>
          {wishlistPlaces.length === 0 ? <p className="empty-small">スポット追加時に「選択中の日程に追加する」のチェックを外すと、ここに保存できます。</p> : <div className="wishlist-list">{wishlistPlaces.map(place => <article className="wishlist-item" key={place.id}><div><strong>{place.name}</strong><p>{place.memo || 'メモはまだありません'}</p></div><button className="soft-button" onClick={() => moveToDay(place.id)}>DAY {Math.max(1, days.findIndex(day => day.id === selectedDay) + 1)} に追加</button><button className="icon-button" onClick={() => deletePlace(place.id)} aria-label="削除"><Trash2 size={15} /></button></article>)}</div>}
        </section>

        <section className="panel album-panel">
          <div className="section-heading"><div className="heading-icon"><Heart size={19} /></div><div><h2>Travel Album</h2><p>旅の思い出・お気に入りの写真</p></div><span className="count-pill">{albumItems.length} PHOTOS</span></div>
          {albumItems.length === 0 ? <div className="empty-state"><ImagePlus size={27} /><p>まだ写真がありません</p><span>スポットの登録画面やメモ欄から写真を追加できます。</span></div> : <div className="album-grid">{albumItems.map(item => <button className="album-card" key={item.id} onClick={() => setSelectedImage(item.image)}><img src={item.image} alt={item.placeName} /><div><strong>{item.placeName}</strong><span>{item.day === null ? 'WISHLIST' : `DAY ${days.findIndex(day => day.id === item.day) + 1}`}</span></div></button>)}</div>}
        </section>
        <footer><div className="footer-logo"><Plane size={17} /> SoraTrip</div><p>Make your own journey. ♡</p></footer>
      </main>

      {selectedImage && <div className="lightbox" onClick={() => setSelectedImage(null)}><button className="lightbox-close" onClick={() => setSelectedImage(null)} aria-label="閉じる"><X size={25} /></button><img src={selectedImage} alt="旅行の写真" onClick={event => event.stopPropagation()} /></div>}
      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
    </div>
  );
}
