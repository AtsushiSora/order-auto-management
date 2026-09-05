import { Fragment } from "react";
import { Check, QrCode } from "lucide-react";
import { vehicleQrGuides, type VehicleQrKind } from "../lib/vehicleQrGuide";

type DocumentExample = "electronic" | "record";

function QrPosition({ position, readCount, expectedCount }: { position: number; readCount: number; expectedCount: number }) {
  const complete = position <= readCount;
  const current = position === Math.min(readCount + 1, expectedCount);
  return (
    <span className={`qr-position ${complete ? "complete" : current ? "current" : ""}`}>
      {complete ? <Check aria-hidden="true" /> : <QrCode aria-hidden="true" />}
      <b>{position}</b>
    </span>
  );
}

function GuideQrGroups({ kind, readCount, document }: { kind: VehicleQrKind; readCount: number; document: DocumentExample }) {
  const guide = vehicleQrGuides[kind];
  const position = (value: number) => <QrPosition position={value} readCount={readCount} expectedCount={guide.steps.length} />;
  if (kind === "light" && document === "record") {
    return (
      <div className="qr-light-record-row" aria-label="左からコード6、5、4、3、2、1">
        {[6, 5, 4].map((code) => <span className="qr-inactive-position" key={code}><QrCode aria-hidden="true" /><small>コード{code}</small></span>)}
        <div className="qr-code-group"><small>コード3</small><div>{position(1)}</div></div>
        <span className="qr-position-arrow" aria-hidden="true">→</span>
        <div className="qr-code-group"><small>コード2</small><div>{position(2)}</div></div>
        <span className="qr-inactive-position"><QrCode aria-hidden="true" /><small>コード1</small></span>
      </div>
    );
  }
  return (
    <div className="qr-code-groups">
      {guide.groups.map((group, groupIndex) => (
        <Fragment key={group.label}>
          {groupIndex > 0 ? <span className="qr-group-arrow" aria-hidden="true">→</span> : null}
          <div className="qr-code-group">
            <small>{group.label}</small>
            <div>
              {group.positions.map((value, index) => (
                <Fragment key={value}>
                  {index > 0 ? <span className="qr-position-arrow" aria-hidden="true">→</span> : null}
                  {position(value)}
                </Fragment>
              ))}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function CertificateExample({ kind, readCount, document }: { kind: VehicleQrKind; readCount: number; document: DocumentExample }) {
  const electronic = document === "electronic";
  return (
    <figure className={`qr-document-example ${document}`}>
      <figcaption><strong>{electronic ? "例1　小さい電子車検証" : "例2　自動車検査証記録事項"}</strong><span>{electronic ? "A6サイズ・右端にICタグ" : "A4サイズの用紙／PDF"}</span></figcaption>
      <div className="qr-certificate-sheet">
        <div className="qr-paper-title">{electronic ? "自動車検査証" : "自動車検査証記録事項"}</div>
        <div className="qr-paper-lines" aria-hidden="true"><span /><span /><span /><span /></div>
        {electronic ? <div className="qr-ic-tag" aria-label="ICタグ"><span>IC</span></div> : null}
        <div className="qr-paper-bottom">
          <span className="qr-location-label">この並びを左から読み取る</span>
          <GuideQrGroups kind={kind} readCount={readCount} document={document} />
        </div>
      </div>
    </figure>
  );
}

export function QrPlacementDiagram({ kind, readCount = 0, compact = false }: { kind: VehicleQrKind; readCount?: number; compact?: boolean }) {
  const guide = vehicleQrGuides[kind];
  return (
    <div className={`qr-placement-diagram ${compact ? "compact" : ""}`} aria-label={`${guide.label}のQRコード配置と読み取り順`}>
      <div className="qr-document-examples">
        <CertificateExample kind={kind} readCount={readCount} document="electronic" />
        <CertificateExample kind={kind} readCount={readCount} document="record" />
      </div>
      <p><strong>青い①から矢印の順</strong>に読み取ります。読み取り済みは<strong className="qr-complete-note">緑色</strong>に変わります。</p>
    </div>
  );
}
