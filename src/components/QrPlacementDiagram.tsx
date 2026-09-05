import { Fragment } from "react";
import { QrCode } from "lucide-react";
import { vehicleQrGuides, type VehicleQrKind } from "../lib/vehicleQrGuide";

export function QrPlacementDiagram({
  kind,
  readCount = 0,
  compact = false,
}: {
  kind: VehicleQrKind;
  readCount?: number;
  compact?: boolean;
}) {
  const guide = vehicleQrGuides[kind];
  const nextPosition = Math.min(readCount + 1, guide.steps.length);
  return (
    <div className={`qr-placement-diagram ${compact ? "compact" : ""}`} aria-label={`${guide.label}のQRコード配置と読み取り順`}>
      <div className="qr-paper-preview">
        <div className="qr-paper-title">車検証記録事項</div>
        <div className="qr-paper-lines" aria-hidden="true"><span /><span /><span /></div>
        <div className="qr-paper-bottom">
          <span className="qr-location-label">用紙の下側</span>
          <div className="qr-code-groups">
            {guide.groups.map((group, groupIndex) => (
              <Fragment key={group.label}>
                {groupIndex > 0 ? <span className="qr-group-arrow" aria-hidden="true">→</span> : null}
                <div className="qr-code-group">
                  <small>{group.label}</small>
                  <div>
                    {group.positions.map((position, index) => (
                      <Fragment key={position}>
                        {index > 0 ? <span className="qr-position-arrow" aria-hidden="true">→</span> : null}
                        <span className={`qr-position ${position <= readCount ? "complete" : position === nextPosition ? "current" : ""}`}>
                          <QrCode aria-hidden="true" />
                          <b>{position}</b>
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <p><strong>①から矢印の順</strong>に、1個ずつカメラの中央へ写します。</p>
    </div>
  );
}
