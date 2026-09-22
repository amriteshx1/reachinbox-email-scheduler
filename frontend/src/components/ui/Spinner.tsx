import "./cube-loader.css";

function CubeLoader() {
  return (
    <div className="cube-loader">
      <div className="box box0">
        <div />
      </div>
      <div className="box box1">
        <div />
      </div>
      <div className="box box2">
        <div />
      </div>
      <div className="box box3">
        <div />
      </div>
      <div className="box box4">
        <div />
      </div>
      <div className="box box5">
        <div />
      </div>
      <div className="box box6">
        <div />
      </div>
      <div className="box box7">
        <div />
      </div>
      <div className="ground">
        <div />
      </div>
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  const large = /\bh-8\b|\bh-10\b|\bh-12\b/.test(className);
  return (
    <span
      className={`cube-loader-frame ${large ? "cube-loader-frame--lg" : "cube-loader-frame--sm"}`}
      aria-hidden
    >
      <CubeLoader />
    </span>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-8 py-4">
          <div className="h-3.5 w-40 animate-pulse rounded bg-wash" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-wash" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-wash" />
        </div>
      ))}
    </div>
  );
}
