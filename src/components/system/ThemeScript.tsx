/**
 * Applies the stored theme before first paint.
 *
 * Inline by necessity: a client component would mount too late and the user
 * would see the wrong theme for a frame. It reads localStorage directly and
 * falls back to `prefers-color-scheme`, matching what ThemeProvider does later
 * so the two never disagree.
 */
export function ThemeScript() {
  const script = `(function(){try{var s=localStorage.getItem("delter.theme");var d=document.documentElement;if(s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){d.classList.add("dark");}else{d.classList.remove("dark");}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
