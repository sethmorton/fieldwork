// Keys for Fieldwork's full-screen overlays. One capture-phase guard on window for keydown, keyup and keypress is
// installed when the userscript loads (document-start), so it runs before any GeoGuessr key listener. While an overlay
// is open every key event stops at the guard (stopImmediatePropagation): GeoGuessr never sees Space (next round) or
// Esc (settings). The overlay's handler gets the keydowns; keys it handles are preventDefault-ed, and so is every
// keyup and keypress. A key pressed while an overlay was open also has its keyup/keypress swallowed after the overlay
// closes, so the Space or Esc that closes a card never reaches GeoGuessr. The next press goes to GeoGuessr as usual.
export function createKeyGuard(){
  let handler=null,alive=()=>false;
  const held=new Set(),id=event=>event.code||event.key;
  function guard(event){
    if(handler&&!alive())handler=null;
    if(handler){
      event.stopImmediatePropagation();
      if(event.type==='keydown'){held.add(id(event));if(handler(event))event.preventDefault()}
      else{event.preventDefault();if(event.type==='keyup')held.delete(id(event))}
      return;
    }
    if(event.type==='keydown'){held.delete(id(event));return}
    if(held.has(id(event))){event.stopImmediatePropagation();event.preventDefault();if(event.type==='keyup')held.delete(id(event))}
  }
  return {
    guard,
    /** `next(event)` returns true for keys it handled; `isAlive()` false releases the guard (overlay removed). */
    open(next,isAlive=()=>true){handler=next;alive=isAlive},
    close(next){if(handler===next)handler=null},
    get active(){return !!handler&&alive()},
  };
}
export const KEY_EVENTS=['keydown','keyup','keypress'];
