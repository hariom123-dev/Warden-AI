/**
 * Graceful Model Loader Utility
 *
 * Provides a resilient loader for local vector / embedding models (such as @xenova/transformers).
 * On initial execution, downloading local vector models (20MB+) can take several seconds to minutes.
 * This helper displays an active terminal spinner or clear progress log:
 * "Downloading local vector model (first run only)..."
 * so newcomers and developers know the system is making progress and has not frozen.
 */

export interface ModelLoaderOptions {
  modelName?: string;
  task?: string;
  onProgress?: (progress: any) => void;
}

/**
 * Creates a lightweight animated terminal spinner or fallback logger.
 */
export function createTerminalSpinner(text: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIdx = 0;
  let timer: NodeJS.Timeout | null = null;
  const isTTY = process.stdout.isTTY;

  if (isTTY) {
    timer = setInterval(() => {
      frameIdx = (frameIdx + 1) % frames.length;
      process.stdout.write(`\r\x1b[36m${frames[frameIdx]}\x1b[0m ${text}`);
    }, 80);
  } else {
    console.log(`[Model Loader] ${text}`);
  }

  return {
    update(newText: string) {
      text = newText;
      if (!isTTY) {
        console.log(`[Model Loader] ${newText}`);
      }
    },
    succeed(finalText?: string) {
      if (timer) clearInterval(timer);
      if (isTTY) {
        process.stdout.write(`\r\x1b[32m✔\x1b[0m ${finalText || text}\n`);
      } else {
        console.log(`[Model Loader] ✔ ${finalText || text}`);
      }
    },
    fail(finalText?: string) {
      if (timer) clearInterval(timer);
      if (isTTY) {
        process.stdout.write(`\r\x1b[31m✖\x1b[0m ${finalText || text}\n`);
      } else {
        console.error(`[Model Loader] ✖ ${finalText || text}`);
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      if (isTTY) {
        process.stdout.write('\r\x1b[K');
      }
    }
  };
}

/**
 * Gracefully loads a HuggingFace / Transformers embedding pipeline with visual feedback.
 */
export async function loadVectorModel(options: ModelLoaderOptions = {}) {
  const {
    modelName = 'Xenova/all-MiniLM-L6-v2',
    task = 'feature-extraction',
    onProgress
  } = options;

  const spinner = createTerminalSpinner(`Downloading local vector model (first run only)... [${modelName}]`);

  try {
    // Dynamic import to avoid hard dependency when transformers is not installed
    // @ts-ignore
    const { pipeline } = await import('@xenova/transformers');

    const extractor = await pipeline(task as any, modelName, {
      progress_callback: (progressInfo: any) => {
        if (progressInfo?.status === 'progress' && typeof progressInfo.progress === 'number') {
          const percent = Math.round(progressInfo.progress);
          spinner.update(`Downloading local vector model (first run only)... ${percent}%`);
        }
        if (onProgress) {
          onProgress(progressInfo);
        }
      }
    });

    spinner.succeed(`Local vector model loaded successfully [${modelName}]`);
    return extractor;
  } catch (err: unknown) {
    const error = err as Error;
    if (error?.message?.includes("Cannot find module '@xenova/transformers'") || (error as any)?.code === 'MODULE_NOT_FOUND') {
      spinner.stop();
      console.warn(`[Model Loader] ⚠️ Optional dependency '@xenova/transformers' is not installed.`);
      console.warn(`[Model Loader] If you are using local vector memory-bank embeddings, run: npm install @xenova/transformers`);
      return null;
    }

    spinner.fail(`Failed to load vector model [${modelName}]: ${error.message}`);
    throw error;
  }
}
