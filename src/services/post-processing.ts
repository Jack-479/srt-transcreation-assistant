export function applyPostProcessing(
  text: string, 
  preserveHonorifics: boolean, 
  sfxMode: 'keep' | 'remove' | 'italicize' | 'bracket'
): string {
  if (!text) return text;
  
  let result = text;
  
  // 1. Honorifics Strip-on-Demand
  if (!preserveHonorifics) {
    // Matches capitalized names followed by a hyphen and a Japanese honorific
    // e.g., Tanaka-san, Yui-chan -> Tanaka, Yui
    const honorificRegex = /\b([A-Z][a-z]+)-(san|chan|kun|senpai|sama|sensei)\b/gi;
    result = result.replace(honorificRegex, '$1');
  }
  
  // 2. SFX Filtering
  // The AI was instructed to wrap SFX in asterisks *pant* or parentheses (pant).
  // Matches (*) or () or [] wrappers
  if (sfxMode !== 'keep') {
    const sfxRegex = /(?:(?:\*([^*]+)\*)|(?:\(([^)]+)\))|(?:\[([^\]]+)\]))/g;
    
    result = result.replace(sfxRegex, (match, g1, g2, g3) => {
      const content = g1 || g2 || g3;
      if (!content) return match;
      
      switch (sfxMode) {
        case 'remove':
          return ''; // Strip entirely
        case 'italicize':
          return `<i>(${content.trim()})</i>`;
        case 'bracket':
          return `[${content.trim()}]`;
        default:
          return match;
      }
    });
    
    // Cleanup double spaces left by removal
    if (sfxMode === 'remove') {
      result = result.replace(/\s{2,}/g, ' ').trim();
    }
  }
  
  return result;
}
