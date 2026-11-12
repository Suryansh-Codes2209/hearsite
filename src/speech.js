import { execFile, execFileSync } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

function has(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Which speech engine is available: macOS `say`, `espeak-ng`, or none. */
export function speechEngine() {
  if (process.platform === 'darwin' && has('say')) return 'say';
  if (has('espeak-ng')) return 'espeak-ng';
  if (has('espeak')) return 'espeak';
  return null;
}

const WAV = ['-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le'];

async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.trim());
}

/** A stretch of silence, used under the title cards and when no speech engine exists. */
export async function silence(seconds, file) {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(seconds), ...WAV, file]);
  return duration(file);
}

/**
 * Speak `text` into a WAV file with a short pause after it.
 * Returns the exact length in seconds so the picture can be held to match.
 */
export async function speak(text, file, { engine, rate, voice, gap = 0.35 }) {
  if (!engine) {
    // No voice available: hold the caption for roughly as long as it would take to say.
    return silence(Math.max(1.2, (text.split(/\s+/).length / rate) * 60 + gap), file);
  }
  const raw = `${file}.raw.${engine === 'say' ? 'aiff' : 'wav'}`;
  // A leading dash would be read as an option by the speech command.
  const safe = text.replace(/^-+/, '');
  if (engine === 'say') {
    await run('say', [...(voice ? ['-v', voice] : []), '-r', String(rate), '-o', raw, '--', safe]);
  } else {
    await run(engine, [...(voice ? ['-v', voice] : []), '-s', String(rate), '-w', raw, '--', safe]);
  }
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', `apad=pad_dur=${gap}`, ...WAV, file]);
  return duration(file);
}
