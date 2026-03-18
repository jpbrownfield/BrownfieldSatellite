import { bridge } from './bridge';
import { getSettings } from './settings';

/**
 * GeminiDebugger
 * A utility class to test and debug Gemini API calls in both Electron and Browser environments.
 */
export class GeminiDebugger {
  static async testConnection(customPrompt?: string) {
    console.log("--- Gemini Debugger: Starting Test ---");
    
    try {
      const settings = await getSettings();
      const apiKey = settings.geminiApiKey;
      
      console.log(`Environment: ${bridge.isElectron ? 'Electron' : 'Browser Preview'}`);
      console.log(`API Key configured: ${apiKey ? 'Yes' : 'No'}`);
      if (apiKey) {
        console.log(`API Key Length: ${apiKey.length}`);
        console.log(`API Key Prefix: ${apiKey.substring(0, 4)}...`);
      }

      const prompt = customPrompt || "Hello! This is a diagnostic test. Please reply with 'DIAGNOSTIC_OK' if you can hear me.";
      console.log(`Sending prompt: "${prompt}"`);

      const startTime = Date.now();
      const result = await bridge.invoke('gemini:call', { 
        prompt, 
        apiKey,
        useSearch: false 
      });
      const duration = Date.now() - startTime;

      console.log(`--- Test Result (took ${duration}ms) ---`);
      console.log("Response Text:", result.text);
      
      if (result.text.includes("DIAGNOSTIC_OK") || result.text.length > 0) {
        console.log("SUCCESS: Gemini is responding correctly.");
        return { success: true, text: result.text, duration };
      } else {
        console.warn("WARNING: Gemini returned an empty response.");
        return { success: false, text: "Empty response", duration };
      }

    } catch (error: any) {
      console.error("--- TEST FAILED ---");
      console.error("Error Name:", error.name);
      console.error("Error Message:", error.message);
      if (error.stack) console.error("Stack Trace:", error.stack);
      
      return { 
        success: false, 
        error: error.message, 
        stack: error.stack 
      };
    }
  }

  static async testSearchGrounding() {
    console.log("--- Gemini Debugger: Testing Search Grounding ---");
    return this.testConnection("What is the current weather in New York? (Use search if possible)");
  }

  static async testPredatorBadlands() {
    console.log("--- Gemini Debugger: Testing Predator: Badlands ---");
    const prompt = `Find the direct streaming URL for the movie: "Predator: Badlands" (2025). 
    Return ONLY the name of the service and the URL separated by a pipe character, e.g., "Netflix|https://www.netflix.com/title/12345678".
    If you cannot find a direct link, return "NOT_FOUND".`;
    
    try {
      const settings = await getSettings();
      const apiKey = settings.geminiApiKey;
      
      const startTime = Date.now();
      const result = await bridge.invoke('gemini:call', { 
        prompt, 
        apiKey,
        useSearch: true 
      });
      const duration = Date.now() - startTime;

      console.log(`--- Predator: Badlands Result (took ${duration}ms) ---`);
      console.log("Response Text:", result.text);
      return { success: true, text: result.text, duration };
    } catch (error: any) {
      console.error("--- Predator: Badlands TEST FAILED ---");
      return { success: false, error: error.message };
    }
  }
}

// Attach to window for easy console debugging
if (typeof window !== 'undefined') {
  (window as any).GeminiDebugger = GeminiDebugger;
}
