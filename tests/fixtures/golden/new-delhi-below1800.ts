// Golden fixture for New Delhi Below-1800 (synthetic structure mirroring real prize layout)
import { type TestCategory, type TestPlayer } from '../../allocation/helpers';

export const startDate = new Date('2024-12-20');

export const players: TestPlayer[] = [
  { id: 'p1', name: 'Arjun Sharma', rank: 1, rating: 1790, gender: 'M', dob: '2005-06-15', state: 'DL' },
  { id: 'p2', name: 'Kunal Singh', rank: 2, rating: 1760, gender: 'M', dob: '2004-11-03', state: 'HR' },
  { id: 'p3', name: 'Rohan Patel', rank: 3, rating: 1725, gender: 'M', dob: '2003-02-20', state: 'GJ' },
  { id: 'p4', name: 'Ishita Rao', rank: 4, rating: 1680, gender: 'F', dob: '2006-04-08', state: 'KA' },
  { id: 'p5', name: 'Meera Gupta', rank: 5, rating: 1650, gender: 'F', dob: '2007-09-12', state: 'DL' },
  { id: 'p6', name: 'Samar Jain', rank: 6, rating: 1620, gender: 'M', dob: '2008-07-30', state: 'RJ' },
  { id: 'p7', name: 'Tanvi Deshpande', rank: 7, rating: 1580, gender: 'F', dob: '2016-03-10', state: 'MH' }, // U08
  { id: 'p8', name: 'Aanya Kapoor', rank: 8, rating: 1540, gender: 'F', dob: '2013-05-18', state: 'DL' }, // U11
  { id: 'p9', name: 'Bhavya Mehta', rank: 9, rating: 1500, gender: 'F', dob: '2010-08-02', state: 'GJ' }, // U14
  { id: 'p10', name: 'Suhani Bansal', rank: 10, rating: 1480, gender: 'F', dob: '2008-12-22', state: 'UP' }, // U17
  { id: 'p11', name: 'Kabir Malhotra', rank: 11, rating: 1460, gender: 'M', dob: '2012-01-14', state: 'DL' },
  { id: 'p12', name: 'Ritvik Das', rank: 12, rating: 1420, gender: 'M', dob: '2014-06-19', state: 'WB' },
  { id: 'p13', name: 'Harshita Nair', rank: 13, rating: 1400, gender: 'F', dob: '2009-11-11', state: 'KL' },
  { id: 'p14', name: 'Prisha Kulkarni', rank: 14, rating: 1380, gender: 'F', dob: '2015-09-01', state: 'MH' },
  { id: 'p15', name: 'Reyansh Bose', rank: 15, rating: 1350, gender: 'M', dob: '2011-02-17', state: 'WB' },
  { id: 'p16', name: 'Siya Kapoor', rank: 16, rating: 1320, gender: 'F', dob: '2017-11-05', state: 'DL' },
];

const mainPrizes = [
  { id: 'main-1', place: 1, cash_amount: 20000 },
  { id: 'main-2', place: 2, cash_amount: 15000 },
  { id: 'main-3', place: 3, cash_amount: 10000 },
  { id: 'main-4', place: 4, cash_amount: 8000 },
  { id: 'main-5', place: 5, cash_amount: 6000 },
];

const bestFemalePrizes = [
  { id: 'bf-1', place: 1, cash_amount: 5000 },
  { id: 'bf-2', place: 2, cash_amount: 4000 },
];

const agePrize = (id: string) => [{ id, place: 1, cash_amount: 3000 }];

export const categories: TestCategory[] = [
  { id: 'main', name: 'Main / Open', is_main: true, order_idx: 0, prizes: mainPrizes },
  { id: 'u08g', name: 'U08 Girls', is_main: false, order_idx: 1, criteria_json: { gender: 'F', max_age: 8 }, prizes: agePrize('u08g-1') },
  { id: 'u11g', name: 'U11 Girls', is_main: false, order_idx: 2, criteria_json: { gender: 'F', max_age: 11 }, prizes: agePrize('u11g-1') },
  { id: 'u14g', name: 'U14 Girls', is_main: false, order_idx: 3, criteria_json: { gender: 'F', max_age: 14 }, prizes: agePrize('u14g-1') },
  { id: 'u17g', name: 'U17 Girls', is_main: false, order_idx: 4, criteria_json: { gender: 'F', max_age: 17 }, prizes: agePrize('u17g-1') },
  { id: 'bf', name: 'Best Female', is_main: false, order_idx: 5, criteria_json: { gender: 'F' }, prizes: bestFemalePrizes },
];

export const totalPrizes = categories.reduce((sum, cat) => sum + cat.prizes.length, 0);
