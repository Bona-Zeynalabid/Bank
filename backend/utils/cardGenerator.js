// Generate realistic virtual card numbers (Luhn algorithm compliant)
class CardGenerator {
  // Generate valid card number using Luhn algorithm
  static generateCardNumber(cardType = 'visa') {
    const prefixes = {
      'visa': ['4'],
      'mastercard': ['51', '52', '53', '54', '55'],
      'amex': ['34', '37']
    };
    
    const prefix = prefixes[cardType][Math.floor(Math.random() * prefixes[cardType].length)];
    const length = cardType === 'amex' ? 15 : 16;
    
    // Generate random digits for the rest
    let cardNumber = prefix;
    for (let i = prefix.length; i < length - 1; i++) {
      cardNumber += Math.floor(Math.random() * 10);
    }
    
    // Calculate Luhn check digit
    const checkDigit = this.calculateLuhnCheckDigit(cardNumber);
    cardNumber += checkDigit;
    
    return cardNumber;
  }
  
  // Luhn algorithm implementation
  static calculateLuhnCheckDigit(number) {
    const digits = number.split('').map(Number);
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return (10 - (sum % 10)) % 10;
  }
  
  // Validate card number
  static validateCardNumber(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    
    const checkDigit = digits.slice(-1);
    const calculated = this.calculateLuhnCheckDigit(digits.slice(0, -1));
    
    return parseInt(checkDigit) === calculated;
  }
  
  // Generate CVV
  static generateCVV() {
    return Math.floor(Math.random() * 900 + 100).toString(); // 3 digits
  }
  
  // Generate expiry date (3 years from now)
  static generateExpiry() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 3);
    
    return {
      month: (date.getMonth() + 1).toString().padStart(2, '0'),
      year: date.getFullYear().toString().slice(-2)
    };
  }
  
  // Format card number for display (e.g., 4532 **** **** 1234)
  static maskCardNumber(cardNumber) {
    const first4 = cardNumber.slice(0, 4);
    const last4 = cardNumber.slice(-4);
    return `${first4} **** **** ${last4}`;
  }
  
  // Detect card type from number
  static detectCardType(cardNumber) {
    const firstDigit = cardNumber[0];
    const firstTwo = cardNumber.slice(0, 2);
    
    if (firstDigit === '4') return 'visa';
    if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'mastercard';
    if (['34', '37'].includes(firstTwo)) return 'amex';
    
    return 'visa'; // default
  }
}

module.exports = CardGenerator;