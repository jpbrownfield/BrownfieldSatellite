import { GoogleGenAI } from "@google/genai";

interface Bridge {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, func: (...args: any[]) => void) => void;
  removeListener: (channel: string, func: (...args: any[]) => void) => void;
  isElectron: boolean;
}

const isElectron = !!(window as any).electron;
const SETTINGS_KEY = 'brownfield_satellite_settings';

export const bridge: Bridge = {
  isElectron,
  invoke: async (channel: string, ...args: any[]) => {
    if (isElectron) {
      return await (window as any).electron.ipcRenderer.invoke(channel, ...args);
    } else {
      // Browser Fallback (AI Studio Preview)
      console.log(`[Bridge Web Fallback] Channel: ${channel}`, args);

      switch (channel) {
        case 'settings:get': {
          const saved = localStorage.getItem(SETTINGS_KEY);
          return saved ? JSON.parse(saved) : {};
        }

        case 'settings:save': {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(args[0]));
          return { success: true };
        }

        case 'gemini:call': {
          const { prompt, apiKey, useSearch } = args[0];
          console.log(`[Bridge Web Fallback] Gemini Call Requested. API Key Length: ${apiKey?.length || 0}, Search: ${useSearch}`);
          
          if (!apiKey) throw new Error("Gemini API Key is missing. Please add it in Settings.");
          
          try {
            const ai = new GoogleGenAI({ apiKey });
            console.log(`[Bridge Web Fallback] Calling Gemini model with prompt: "${prompt.substring(0, 50)}..."`);
            
            const response = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite-preview",
              contents: prompt,
              config: {
                tools: useSearch ? [{ googleSearch: {} }] : []
              }
            });
            
            console.log(`[Bridge Web Fallback] Gemini Call Successful. Response:`, response);
            return { text: response.text || "" };
          } catch (error: any) {
            console.error("Gemini Web Call Error:", error);
            const detail = error.message || "Unknown error";
            throw new Error(`Gemini Call Failed: ${detail}`);
          }
        }

        case 'desktop:launch': {
          const { url } = args[0];
          // In the browser, we simulate a launch by opening a popup
          const width = window.screen.availWidth;
          const height = window.screen.availHeight;
          const left = 0;
          const top = 0;

          const win = window.open(
            url, 
            '_blank', 
            `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
          );
          
          if (!win) {
            return { error: "Popup blocked", details: "Please allow popups to launch streaming apps in the preview." };
          }
          return { success: true, simulated: true };
        }

        case 'desktop:validate-path': {
          return { exists: true, message: "Path validation simulated in browser preview." };
        }

        case 'desktop:close': {
          return { success: true };
        }

        case 'desktop:auto-play': {
          return { success: false, error: "Auto-play simulated in browser preview." };
        }

        case 'debug:get-logs': {
          return "Logs are only available in the desktop executable.";
        }

        default:
          throw new Error(`Unknown bridge channel: ${channel}`);
      }
    }
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    if (isElectron) (window as any).electron.ipcRenderer.on(channel, func);
  },
  removeListener: (channel: string, func: (...args: any[]) => void) => {
    if (isElectron) (window as any).electron.ipcRenderer.removeListener(channel, func);
  }
};
