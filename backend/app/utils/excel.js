const { startOfMonth, endOfMonth, addWeeks, isAfter, setDay, setMonth } = require('date-fns');

const cellValueToString = (cell) => {
  if (!cell) return null;
  if (typeof cell === "string") return cell;
  if (cell?.text) return cell.text; // hyperlink o rich text
  return String(cell); // fallback generico
};

const objectToRow = (header, obj) => {
  const row = {};

  header.forEach(col => {
    row[col] = obj[col] ?? null;
  });

  return row;
}

// autoSizeColumns(sheet, { min: 15, max: 80 }); usa i valori passati
// autoSizeColumns(sheet, { max: 100 }); usa solo il valore passato
// autoSizeColumns(sheet); usa i valori di default
const autoSizeColumns = (sheet, { min = 10, max = 50 } = {}) => {
  sheet.columns.forEach(column => {
    let maxLength = column.header.length;

    column.eachCell({ includeEmpty: true }, cell => {
      const value = cell.value;
      if (!value) return;

      const text =
        typeof value === 'string'
          ? value
          : value instanceof Date
          ? value.toISOString()
          : value.toString();

      maxLength = Math.max(maxLength, text.length);
    });

    column.width = Math.min(Math.max(maxLength + 2, min), max);
  });
}

const writeObjRow = (header, sheet, objectOrArray) => {

  const safeObjArray = Array.isArray(objectOrArray) ? objectOrArray : [objectOrArray];

  // header
  sheet.columns = header.map(c => ({
    header: c,
    key: c
  }));

  // scrivi le righe SOLO se esiste almeno un oggetto valido
  const hasData = safeObjArray.some(obj => obj && Object.keys(obj).length > 0);

  if (hasData) {
    safeObjArray.forEach(obj => {
      if (obj) {
        // rows -> obj viene mappato con chiave(nome header/colonna) valore per ogni colonna 
        // se non trova la chiave salta la colonna
        sheet.addRow(objectToRow(header, obj));
      }
    });
  }

  // ridimensiono le colonne in base al contenuto
  autoSizeColumns(sheet);
}

const fileNameWithDate = (name) => {
  let now = new Date();

  let year = now.getFullYear();              // YYYY
  let month = String(now.getMonth() + 1).padStart(2, '0'); // MM (0-index!)
  let day = String(now.getDate()).padStart(2, '0');        // DD

  let hours = String(now.getHours()).padStart(2, '0');     // hh
  let minutes = String(now.getMinutes()).padStart(2, '0'); // mm

  let timestamp = `${year}${month}${day}_${hours}${minutes}`;

  let filename = `${name}_${timestamp}.xlsx`;
  return filename;
}

const rowToObject = (header, sheet, skipRow = 1) => {
  const rows = [];
  sheet.eachRow((row, index) => {
    if (index === skipRow) return; // salta header
    rows.push(row);
  });

  const objects = rows.map(row => {
    const obj = Object.fromEntries(
      header.map(key => [key, cellValueToString(row.getCell(key).value)])
    );
    return obj;
  });

  return Array.isArray(objects) ? objects : [objects];;
}

// const dates = generateEventDates(1, 3, 1); // gennaio, 3 mesi, giorno = lunedì
const generateEventDates = (startMonth, monthCount, dayOfWeek) => {
  const today = new Date();
  const year = today.getFullYear();
  const dates = [];

  for (let m = 0; m < monthCount; m++) {
    const month = startMonth - 1 + m; // JS mesi 0-based
    let current = setDay(setMonth(new Date(year, month, 1), month), dayOfWeek, { weekStartsOn: 0 });
    const monthEnd = endOfMonth(new Date(year, month, 1));

    while (!isAfter(current, monthEnd)) {
      dates.push(new Date(current)); // crea una copia per sicurezza
      current = addWeeks(current, 1);
    }
  }

  return dates;
}

module.exports = { cellValueToString, writeObjRow, fileNameWithDate, rowToObject, generateEventDates };