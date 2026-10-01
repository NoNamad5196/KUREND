import "./static-backdrop.css";

/** Decorative background only; characters and UI remain independent elements. */
export function StaticBackdrop() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- supplied decorative artwork, no responsive crop files
    <img className="static-backdrop" src="/assets/kurend/backgrounds/campus/source.png" width={1672} height={941} alt="" aria-hidden="true" draggable={false} />
  );
}
