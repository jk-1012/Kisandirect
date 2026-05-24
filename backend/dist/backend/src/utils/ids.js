function randomSixDigits() {
    return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
}
export function generateKisanId(stateCode) {
    const upperState = stateCode.toUpperCase();
    return `KD-${upperState}-${randomSixDigits()}`;
}
export function generateListingId() {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `LST-${year}${month}${day}-${randomSixDigits()}`;
}
