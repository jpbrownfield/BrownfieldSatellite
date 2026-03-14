import { GoogleGenAI } from "@google/genai";

interface Bridge {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
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
          const { prompt, apiKey } = args[0];
          if (!apiKey) throw new Error("Gemini API Key is missing. Please add it in Settings.");
          
          try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: [{ parts: [{ text: prompt }] }],
            });
            return { text: response.text || "" };
          } catch (error: any) {
            console.error("Gemini Web Call Error:", error);
            throw error;
          }
        }

        case 'desktop:launch': {
          const { url } = args[0];
          // In the browser, we simulate a launch by opening a popup
          const width = 1280;
          const height = 720;
          const left = (window.screen.width / 2) - (width / 2);
          const top = (window.screen.height / 2) - (height / 2);

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

        case 'debug:get-logs': {
          return "Logs are only available in the desktop executable.";
        }

        default:
          throw new Error(`Unknown bridge channel: ${channel}`);
      }
    }
  }
};
