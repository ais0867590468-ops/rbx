import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
} from "lucide-react";

export function PandaVideo({ className = "" }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function formatTime(sec: number) {
    if (isNaN(sec) || !isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        setHasStarted(true);
      }).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pos * duration;
    setCurrentTime(pos * duration);
  }

  function handleMouseMove() {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (isPlaying) {
      hideTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={`group relative mx-auto w-full max-w-[340px] select-none overflow-hidden rounded-2xl border border-line/80 bg-black shadow-2xl transition-all ${className}`}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          src="/videos/tutorial.mp4"
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
          onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
          onEnded={() => {
            setIsPlaying(false);
            setShowControls(true);
          }}
          className="size-full cursor-pointer object-cover"
        />

        {/* Center Big Panda Play Button */}
        {(!isPlaying || !hasStarted) && (
          <div
            onClick={togglePlay}
            className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/25 backdrop-blur-[1px] transition-all duration-300"
          >
            <button
              type="button"
              aria-label="Reproduzir vídeo"
              className="group/btn relative flex size-20 items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_0_35px_rgba(249,115,22,0.6)] transition-all duration-300 hover:scale-110 hover:bg-[#ea580c] hover:shadow-[0_0_45px_rgba(249,115,22,0.85)] active:scale-95 sm:size-24"
            >
              <div className="absolute inset-0 animate-ping rounded-full bg-[#f97316]/30 opacity-75" />
              <Play className="relative ml-1.5 size-9 fill-white sm:size-11" />
            </button>
          </div>
        )}

        {/* Bottom Panda-styled Control Bar */}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 pt-8 transition-opacity duration-300 ${
            showControls || !isPlaying ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {/* Progress Bar (Clickable) */}
          <div
            onClick={handleSeek}
            className="group/progress relative mb-3 h-1.5 w-full cursor-pointer rounded-full bg-white/20 transition-all hover:h-2.5"
          >
            <div
              className="relative h-full rounded-full bg-[#f97316] transition-all"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 scale-0 rounded-full bg-white shadow-md transition-transform group-hover/progress:scale-100" />
            </div>
          </div>

          {/* Action Buttons & Time Display */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              >
                {isPlaying ? (
                  <Pause className="size-5 fill-white" />
                ) : (
                  <Play className="size-5 fill-white" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                aria-label={isMuted ? "Ativar som" : "Desativar som"}
              >
                {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>

              <span className="font-mono text-xs font-medium tracking-wider text-white/90">
                {formatTime(currentTime)}
                <span className="text-white/40"> / </span>
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {currentTime >= duration && duration > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play();
                      setIsPlaying(true);
                    }
                  }}
                  className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                  aria-label="Reiniciar"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
