export function digestText(text) {
  let hash = 5381;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
