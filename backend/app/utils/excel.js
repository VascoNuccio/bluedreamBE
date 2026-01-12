const cellValueToString = (cell) => {
  if (!cell) return null;
  if (typeof cell === "string") return cell;
  if (cell?.text) return cell.text; // hyperlink o rich text
  return String(cell); // fallback generico
};

module.exports = { cellValueToString };