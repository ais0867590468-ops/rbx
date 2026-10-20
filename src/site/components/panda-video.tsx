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

  const maxTimeWatchedRef = useRef(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function formatTime(sec: number) {
    if (isNaN(sec) || !isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function handlePlayClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setHasStarted(true);
        })
        .catch(() => {
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              setHasStarted(true);
            })
            .catch(() => {});
        });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  function toggleFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
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
    const video = videoRef.current;
    if (!video) return;

    const handleMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
      if (video.currentTime === 0) {
        try {
          video.currentTime = 0.05;
        } catch {}
      }
    };

    const handleDuration = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };

    const handleTime = () => {
      // Track the furthest point the user has legitimately watched
      if (video.currentTime > maxTimeWatchedRef.current) {
        maxTimeWatchedRef.current = video.currentTime;
      }
      setCurrentTime(video.currentTime || 0);
    };

    const handleSeeking = () => {
      // Disallow advancing forward beyond what has already been watched
      if (video.currentTime > maxTimeWatchedRef.current + 0.5) {
        video.currentTime = maxTimeWatchedRef.current;
      }
    };

    const handleOnPlay = () => {
      setIsPlaying(true);
      setHasStarted(true);
    };

    const handleOnPause = () => {
      setIsPlaying(false);
    };

    const handleOnEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block keyboard forward seeking (ArrowRight, L, etc.)
      if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("durationchange", handleDuration);
    video.addEventListener("canplay", handleDuration);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("seeking", handleSeeking);
    video.addEventListener("play", handleOnPlay);
    video.addEventListener("pause", handleOnPause);
    video.addEventListener("ended", handleOnEnded);
    window.addEventListener("keydown", handleKeyDown);

    if (video.readyState >= 1) {
      handleMetadata();
    }

    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("durationchange", handleDuration);
      video.removeEventListener("canplay", handleDuration);
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("seeking", handleSeeking);
      video.removeEventListener("play", handleOnPlay);
      video.removeEventListener("pause", handleOnPause);
      video.removeEventListener("ended", handleOnEnded);
      window.removeEventListener("keydown", handleKeyDown);
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
      className={`group relative mx-auto w-full max-w-[340px] select-none overflow-hidden rounded-2xl border border-line/80 bg-neutral-950 shadow-2xl transition-all ${className}`}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-neutral-950">
        <video
          ref={videoRef}
          src="/videos/tutorial.mp4"
          poster="/images/tutorial-thumb.jpg"
          playsInline
          preload="auto"
          onClick={handlePlayClick}
          className="size-full cursor-pointer object-cover"
        />

        {/* Center Big Panda Play Button */}
        {(!isPlaying || !hasStarted) && (
          <div
            onClick={handlePlayClick}
            className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/20 backdrop-blur-[1px] transition-all duration-300"
          >
            <div className="relative flex size-20 items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_0_35px_rgba(249,115,22,0.65)] transition-all duration-300 hover:scale-110 hover:bg-[#ea580c] hover:shadow-[0_0_45px_rgba(249,115,22,0.9)] active:scale-95 sm:size-24">
              <div className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[#f97316]/30 opacity-75" />
              <Play className="pointer-events-none relative ml-1.5 size-9 fill-white sm:size-11" />
            </div>
          </div>
        )}

        {/* Bottom Panda-styled Control Bar */}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 pt-8 transition-opacity duration-300 ${
            showControls || !isPlaying ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {/* Progress Bar (Visual only — Seeking Disabled) */}
          <div className="relative mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/20 pointer-events-none">
            <div
              className="h-full rounded-full bg-[#f97316] transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Action Buttons & Time Display */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePlayClick}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    const video = videoRef.current;
                    if (video) {
                      video.currentTime = 0;
                      video.play();
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
