import { useEffect, useState, type CSSProperties } from 'react';
import { CARDS, CARD_IDS, ELEMENTS, ELEMENT_IDS, MINIGAMES, MINIGAME_IDS } from '@sp/shared';

type Tab = 'controls' | 'elements' | 'cards' | 'modes';
const SEEN_KEY = 'sp.howToSeen';

const TABS: ReadonlyArray<[Tab, string]> = [
  ['controls', 'Điều khiển'],
  ['elements', 'Nguyên tố'],
  ['cards', 'Thẻ kỹ năng'],
  ['modes', 'Minigame & chế độ'],
];

const CONTROLS: ReadonlyArray<[action: string, keys: string, mouse: string]> = [
  ['Di chuyển', 'WASD / mũi tên', '—'],
  ['Nhảy', 'Space', '—'],
  ['Xoay camera', 'Q / E', 'Click vào màn hình để khoá chuột rồi rê chuột (như game bắn súng) · Esc để thả'],
  ['Zoom', '+ / −', 'Lăn con lăn'],
  ['Dùng nguyên tố', 'F', 'Click trái: dùng tại tâm ngắm (rê chuột lên/xuống để ngắm xa/gần)'],
  ['Huỷ ngắm', '—', 'Nhấp chuột phải'],
  ['Chọn nguyên tố / thẻ kỹ năng', '—', 'Click vào ô / thẻ muốn chọn'],
  ['Kéo Co · Phản Xạ', 'Space đúng lúc', 'Click trái đúng lúc'],
];

/** "How to play" button + dialog for the lobby. Opens by itself the first time on this browser. */
export function HowToPlay() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('controls');

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // storage blocked: just do not auto-open
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-secondary howto-open" onClick={() => setOpen(true)}>
        Hướng dẫn chơi
      </button>
      {open && (
        <div className="howto-backdrop" role="dialog" aria-modal="true" aria-label="Hướng dẫn chơi" onClick={close}>
          <div className="howto" onClick={(e) => e.stopPropagation()}>
            <div className="howto-head">
              <h2>Hướng dẫn chơi</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Đóng</button>
            </div>
            <div className="segmented howto-tabs" role="tablist">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="howto-body">
              {tab === 'controls' && <Controls />}
              {tab === 'elements' && <Elements />}
              {tab === 'cards' && <Cards />}
              {tab === 'modes' && <Modes />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Controls() {
  return (
    <>
      <p className="howto-lead"><b>Bàn phím để di chuyển</b>, <b>chuột để xoay camera, dùng nguyên tố và chọn kỹ năng</b>. Không thích khoá chuột? Vào Cài đặt → "Xoay camera bằng chuột" → Giữ chuột phải.</p>
      <table className="howto-table">
        <thead>
          <tr><th>Việc</th><th>Bàn phím</th><th>Chuột</th></tr>
        </thead>
        <tbody>
          {CONTROLS.map(([a, k, m]) => (
            <tr key={a}><td>{a}</td><td>{k}</td><td>{m}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Elements() {
  return (
    <>
      <ol className="howto-steps">
        <li><b>Chọn:</b> lúc hiện luật mỗi vòng, click 1 nguyên tố ở hàng dưới màn hình (không chọn thì được random).</li>
        <li><b>Dùng:</b> khi chơi, <b>click chuột trái</b> — chiêu bay tới chỗ tâm ngắm chỉ (rê chuột để ngắm). Chiêu cho bản thân thì click lúc nào cũng được.</li>
        <li><b>Hồi chiêu:</b> dùng không giới hạn, nút hiện số giây chờ. Nhân vật mang hình xăm theo nguyên tố đã chọn.</li>
      </ol>
      <ul className="howto-grid">
        {ELEMENT_IDS.map((id) => {
          const e = ELEMENTS[id];
          return (
            <li key={id} style={{ '--el': e.color } as CSSProperties}>
              <span className="element-glyph">{e.glyph}</span>
              <div>
                <b>{e.name}</b> <small className="muted">{e.aim === 'point' ? 'ngắm' : 'tự dùng'} · hồi {e.cooldown}s</small>
                <p>{e.desc}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted howto-note">Mọi minigame đều dùng được cả 9 nguyên tố (trừ những cái host đã bỏ trong màn chờ).</p>
    </>
  );
}

function Cards() {
  return (
    <>
      <ol className="howto-steps">
        <li><b>Đầu trận</b> mỗi người được tặng 1 thẻ ngẫu nhiên.</li>
        <li><b>Sau mỗi vòng</b>, ở màn kết quả, <b>click chọn 1 trong 3 thẻ</b> (người xếp cuối được 4 thẻ). Có 10 giây, không chọn thì random.</li>
        <li><b>Thẻ tự có tác dụng</b> — không cần bấm gì khi chơi. Các thẻ đang có hiện ở góc trái trên, ♥ là số mạng còn lại.</li>
        <li>Chọn <b>trùng thẻ</b> thì lên cấp. <b>Cấp 3 = thức tỉnh</b>: hiệu ứng đặc biệt, hào quang dưới chân và cả phòng được thông báo.</li>
      </ol>
      <ul className="howto-grid">
        {CARD_IDS.map((id) => {
          const c = CARDS[id];
          return (
            <li key={id} style={{ '--el': c.color } as CSSProperties}>
              <span className="element-glyph">{c.glyph}</span>
              <div>
                <b>{c.name}</b>
                <p>{c.levels[0]} → {c.levels[1].toLowerCase()}</p>
                <p className="howto-awaken">{c.levels[2]}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Modes() {
  return (
    <>
      <ul className="howto-list">
        {MINIGAME_IDS.map((id) => (
          <li key={id}><b>{MINIGAMES[id].title}:</b> {MINIGAMES[id].rules[0]} {MINIGAMES[id].rules[1]}</li>
        ))}
      </ul>
      <ul className="howto-list">
        <li><b>Va chạm:</b> người chơi húc được nhau. Bị húc lúc đèn đỏ là bị loại!</li>
        <li><b>Loại trực tiếp</b> (mặc định): thua vòng bị loại, còn 1 người là thắng.</li>
        <li><b>Không bị loại:</b> chơi đủ 5 vòng, cộng điểm theo thứ hạng, nhiều điểm nhất thắng.</li>
        <li>Host bật/tắt <b>Nguyên tố</b>, <b>Thẻ kỹ năng</b> và <b>Không bị loại</b> ngay trong màn chờ này.</li>
      </ul>
    </>
  );
}
