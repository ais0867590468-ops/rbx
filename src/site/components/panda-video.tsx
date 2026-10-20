/** Tutorial video (Panda Video player), vertical like the reference store. */
const VIDEO_SRC =
  "https://player-vz-f454c392-d2f.tv.pandavideo.com.br/embed/?v=a771e9f9-2eba-4906-82bf-95ab590b5e39";

export function PandaVideo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-[350px] overflow-hidden rounded-lg border border-line bg-black ${className}`}
    >
      <div className="relative aspect-[9/16] w-full">
        <iframe
          src={VIDEO_SRC}
          title="Como funciona a compra na RecargasBuxs"
          className="absolute inset-0 size-full border-0"
          loading="lazy"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}
