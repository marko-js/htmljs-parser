const backslashRunReg = /(\\*)(\$!?\{|$)/g;
const placeholderStartReg = /^\\*\$!?\{/;

/**
 * Escapes text content so that the parser reads it back as the same text.
 * Only a backslash run before `${` or `$!{` is read as escapes, halving it,
 * with an odd run keeping the placeholder as text, so only those runs change.
 * Pass the content printed right after the text as `next`: a backslash run
 * ending the text joins any that starts `next`, so it is doubled when that
 * run leads into `${` or `$!{`. Whitespace is left alone, since which of it
 * renders depends on the text's siblings and syntax.
 */
export function escapeText(text: string, next = "") {
  return text.replace(
    backslashRunReg,
    placeholderStartReg.test(next) ? escapeRunBeforePlaceholder : escapeRun,
  );
}

function escapeRun(_: string, run: string, open: string) {
  return open ? `${run}${run}\\${open}` : run;
}

function escapeRunBeforePlaceholder(_: string, run: string, open: string) {
  return open ? `${run}${run}\\${open}` : run + run;
}
