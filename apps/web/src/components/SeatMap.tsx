import { useState, type CSSProperties } from 'react';
import { Armchair, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { SalesEvent } from '@ftu/shared';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const seatLabels = {
  AVAILABLE: 'Còn trống',
  HELD: 'Đang được giữ',
  SOLD: 'Đã bán',
  UNAVAILABLE: 'Không mở bán',
};
export default function SeatMap({
  event,
  selected,
  disabled,
  illustrative,
  onSelect,
}: {
  event: SalesEvent;
  selected: string[];
  disabled: boolean;
  illustrative: boolean;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const rows = [...new Set(event.seats.map((seat) => seat.row_label))];
  const columns = [...new Set(event.seats.map((seat) => seat.seat_number))].sort((a, b) => a - b);
  const positions = new Map(
    event.seats.map((seat) => [`${seat.row_label}:${seat.seat_number}`, seat]),
  );
  const categories = new Map(event.categories.map((category) => [category.id, category]));
  const rowStyle = {
    '--seat-size': `${44 * zoom}px`,
    '--seat-icon-size': `${25 * zoom}px`,
    '--seat-font-size': `${12 * zoom}px`,
  } as CSSProperties;
  return (
    <div className="cinema-seat-map">
      <div className="cinema-map-heading">
        <div>
          <h2>Sơ đồ chỗ ngồi</h2>
          <p>
            {illustrative
              ? 'Mẫu minh họa · Chưa phải sơ đồ chính thức của địa điểm'
              : 'Chọn theo hàng và số ghế được công bố'}
          </p>
        </div>
        <div className="cinema-zoom" aria-label="Độ lớn sơ đồ">
          <button
            type="button"
            aria-label="Thu nhỏ sơ đồ"
            disabled={zoom <= 1}
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
          >
            <ZoomOut size={18} aria-hidden="true" />
          </button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Phóng to sơ đồ"
            disabled={zoom >= 1.75}
            onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}
          >
            <ZoomIn size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Đưa sơ đồ về kích thước mặc định"
            onClick={() => setZoom(1)}
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="cinema-tier-key" aria-label="Hạng vé">
        {event.categories.map((category) => (
          <span key={category.id} className={`cinema-tier tier-${category.position}`}>
            <i aria-hidden="true" />
            {category.name}
            <strong>{money.format(category.price_vnd)}</strong>
          </span>
        ))}
      </div>
      <p className="cinema-scroll-hint">
        Vuốt hoặc cuộn ngang để xem hết hàng ghế. Chạm vào ghế trống để chọn.
      </p>
      <div
        className="cinema-scroll"
        role="region"
        aria-label="Sơ đồ ghế có thể cuộn ngang"
        tabIndex={0}
      >
        <div className="cinema-hall" style={rowStyle}>
          <div className="cinema-stage">
            <svg viewBox="0 0 600 75" aria-hidden="true">
              <path d="M80 68 160 8H440L520 68Z" />
            </svg>
            <span>Sân khấu</span>
          </div>
          <div className="cinema-orientation" aria-hidden="true">
            <span>Cánh trái</span>
            <span>Trung tâm</span>
            <span>Cánh phải</span>
          </div>
          <div className="cinema-rows">
            {rows.map((row, rowIndex) => (
              <div key={row}>
                {illustrative && rowIndex === 4 && (
                  <div className="cinema-cross-aisle" aria-hidden="true">
                    Lối đi ngang
                  </div>
                )}
                <div className="cinema-row" role="group" aria-label={`Hàng ${row}`}>
                  <span className="cinema-row-name" aria-hidden="true">
                    {row}
                  </span>
                  <div className="cinema-row-seats">
                    {columns.map((number, index) => {
                      const seat = positions.get(`${row}:${number}`);
                      const category = seat ? categories.get(seat.category_id) : undefined;
                      const chosen = seat ? selected.includes(seat.id) : false;
                      return (
                        <div
                          key={index}
                          className={`cinema-seat-slot${illustrative && index > 0 && index % 4 === 0 ? ' has-aisle' : ''}`}
                        >
                          {seat && category ? (
                            <button
                              type="button"
                              className={`sales-seat cinema-seat tier-${category.position} seat-${seat.state.toLowerCase()}${chosen ? ' is-selected' : ''}`}
                              aria-pressed={chosen}
                              aria-label={`Ghế ${seat.label}, ${category.name}, ${seatLabels[seat.state]}${chosen ? ', bạn chọn' : ''}`}
                              title={`${seat.label} · ${category.name} · ${seatLabels[seat.state]}`}
                              disabled={
                                disabled ||
                                seat.state !== 'AVAILABLE' ||
                                (!chosen && selected.length >= event.max_tickets)
                              }
                              onClick={() => onSelect(seat.id)}
                            >
                              <Armchair className="cinema-chair" aria-hidden="true" />
                              <span className="cinema-seat-number">{seat.seat_number}</span>
                              {chosen && (
                                <Check className="cinema-seat-check" size={12} aria-hidden="true" />
                              )}
                            </button>
                          ) : (
                            <span className="cinema-empty-seat" aria-hidden="true" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="cinema-row-name" aria-hidden="true">
                    {row}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {illustrative && (
            <div className="cinema-exits" aria-hidden="true">
              <span>← Lối ra minh họa</span>
              <span>Lối ra minh họa →</span>
            </div>
          )}
        </div>
      </div>
      <div className="cinema-state-key" aria-label="Trạng thái ghế">
        <span>
          <i className="key-free" aria-hidden="true" />
          Còn trống
        </span>
        <span>
          <i className="key-selected" aria-hidden="true" />✓ Bạn chọn
        </span>
        <span>
          <i className="key-held" aria-hidden="true" />
          Đang giữ
        </span>
        <span>
          <i className="key-sold" aria-hidden="true" />— Đã bán / không mở bán
        </span>
      </div>
      <div className="cinema-availability">
        {event.categories.map((category) => (
          <p key={category.id}>
            {category.name}: <strong>{category.available}</strong>/{category.capacity} ghế còn trống
          </p>
        ))}
      </div>
    </div>
  );
}
