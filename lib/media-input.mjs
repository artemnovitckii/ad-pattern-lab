const MEDIA_FORMATS = "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,flv,mpegts,mp3,wav,flac,ogg,aac,png_pipe,jpeg_pipe,webp_pipe,webp_anim,gif";

export const MEDIA_INPUT_OPTIONS = Object.freeze([
  "-protocol_whitelist", "file",
  "-format_whitelist", MEDIA_FORMATS,
]);

export function imageInputOptions(bytes) {
  // Some JPEGs auto-detect as image2, which can open a sequence of files.
  return bytes[0] === 0xff && bytes[1] === 0xd8
    ? ["-f", "jpeg_pipe", ...MEDIA_INPUT_OPTIONS]
    : MEDIA_INPUT_OPTIONS;
}
