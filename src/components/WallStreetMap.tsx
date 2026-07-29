// ============================================================
// WallStreetMap.tsx — the framed hero visual. The FULL square map
// image is shown, blurred; a circular "lens" over the center reveals
// the same image in sharp focus. Editorial print effect.
// ============================================================
import mapImg from '../assets/downtown-map.jpg';
import './WallStreetMap.css';

export function WallStreetMap() {
  return (
    <div className="wsm">
      {/* blurred full image (out of focus) */}
      <img src={mapImg} alt="" aria-hidden="true" className="wsm-img wsm-img--blur" />
      {/* sharp image revealed only inside the circular lens */}
      <div className="wsm-lens">
        <img src={mapImg} alt="Editorial map of Lower Manhattan's Financial District" className="wsm-img wsm-img--sharp" />
        <span className="wsm-lens-ring" />
      </div>
    </div>
  );
}
