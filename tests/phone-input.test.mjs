import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPhoneNumberInput,phoneInputChange} from '../src/lib/phone-input.ts';
test('phone numbers show separators while typing and accept pasted formatted numbers',()=>{
 for(const [input,expected]of [['',''],['010','010'],['0100','010-0'],['0100000','010-0000'],['01000001','010-0000-1'],['01000001111','010-0000-1111'],['010-0000-1111','010-0000-1111'],['02 123 4567','02-123-4567'],['0212345678','02-1234-5678'],['0611234567','061-123-4567'],['03112345678','031-1234-5678'],['15881234','1588-1234']])assert.equal(formatPhoneNumberInput(input),expected,input);
});
test('inserting in the middle preserves the digit position and backspacing a separator removes a digit',()=>{
 assert.deepEqual(phoneInputChange('010-0000-1111','0100000-1111',3,'deleteContentBackward'),{value:'010-0001-111',caret:2});
 const inserted=phoneInputChange('010-000-111','010-0002-111',8,'insertText');assert.equal(inserted.value,'010-0002-111');assert.equal(inserted.caret,9);
 assert.deepEqual(phoneInputChange('010-0000-1111','',0,'deleteContentBackward'),{value:'',caret:0});
});
