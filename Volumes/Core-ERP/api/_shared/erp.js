'use strict';

const glTypes=['asset','liability','equity','revenue','expense'];
const workflowStates=['draft','submitted','approved','rejected','blocked','archived','deleted','reversed'];
const ledgerTypeSeeds=[
  ['gl','asset','Asset',true],
  ['gl','liability','Liability',true],
  ['gl','equity','Equity',true],
  ['gl','revenue','Revenue',true],
  ['gl','expense','Expense',true],
  ['bank','current_account','Current account',false],
  ['bank','savings_account','Savings account',false],
  ['bank','cash_account','Cash account',false],
  ['bank','credit_card','Credit card',false],
  ['customer','trade_customer','Trade customer',false],
  ['customer','cash_customer','Cash customer',false],
  ['customer','intercompany_customer','Intercompany customer',false],
  ['vendor','trade_vendor','Trade vendor',false],
  ['vendor','service_provider','Service provider',false],
  ['vendor','intercompany_vendor','Intercompany vendor',false],
  ['employee','permanent_employee','Permanent employee',false],
  ['employee','contractor','Contractor',false],
  ['asset','fixed_asset','Fixed Asset',false],
  ['asset','right_of_use_asset','Right-of-use Asset',false],
  ['asset','intangible_asset','Intangible Asset',false],
  ['asset','investment_property','Investment Property',false],
  ['asset','asset_under_construction','Asset Under Construction',false],
  ['asset','low_value_asset','Low-value Asset',false],
  ['asset','leased_asset','Leased Asset',false],
  ['asset','inventory_asset','Inventory Asset',false],
  ['asset','biological_asset','Biological Asset',false],
  ['asset','financial_asset','Financial Asset',false],
  ['project','capital_project','Capital project',false],
  ['project','operational_project','Operational project',false],
  ['contract','customer_contract','Customer contract',false],
  ['contract','supplier_contract','Supplier contract',false],
  ['loan','loan_account','Loan account',false],
  ['loan','intercompany_loan','Intercompany loan',false]
];
const currencies=[
  ['USD','US Dollar',2,true],
  ['GBP','Pound Sterling',2,true],
  ['EUR','Euro',2,true],
  ['ZAR','South African Rand',2,true]
];
const countries=[
  ["AF","AFG","004","Afghanistan","Islamic Republic of Afghanistan","Asia","Southern Asia","AFN","+93",false,"Region"],
  ["AX","ALA","248","Åland Islands","Åland Islands","Europe","Northern Europe","EUR","+35818",false,"Region"],
  ["AL","ALB","008","Albania","Republic of Albania","Europe","Southeast Europe","ALL","+355",false,"Region"],
  ["DZ","DZA","012","Algeria","People's Democratic Republic of Algeria","Africa","Northern Africa","DZD","+213",true,"Region"],
  ["AS","ASM","016","American Samoa","American Samoa","Oceania","Polynesia","USD","+1684",false,"Region"],
  ["AD","AND","020","Andorra","Principality of Andorra","Europe","Southern Europe","EUR","+376",true,"Region"],
  ["AO","AGO","024","Angola","Republic of Angola","Africa","Middle Africa","AOA","+244",false,"Region"],
  ["AI","AIA","660","Anguilla","Anguilla","Americas","Caribbean","XCD","+1264",false,"Region"],
  ["AQ","ATA","010","Antarctica","Antarctica","Antarctic",null,null,null,false,"Region"],
  ["AG","ATG","028","Antigua and Barbuda","Antigua and Barbuda","Americas","Caribbean","XCD","+1268",false,"Region"],
  ["AR","ARG","032","Argentina","Argentine Republic","Americas","South America","ARS","+54",true,"Province"],
  ["AM","ARM","051","Armenia","Republic of Armenia","Asia","Western Asia","AMD","+374",true,"Region"],
  ["AW","ABW","533","Aruba","Aruba","Americas","Caribbean","AWG","+297",false,"Region"],
  ["AU","AUS","036","Australia","Commonwealth of Australia","Oceania","Australia and New Zealand","AUD","+61",true,"State/Territory"],
  ["AT","AUT","040","Austria","Republic of Austria","Europe","Central Europe","EUR","+43",true,"State"],
  ["AZ","AZE","031","Azerbaijan","Republic of Azerbaijan","Asia","Western Asia","AZN","+994",true,"Region"],
  ["BS","BHS","044","Bahamas","Commonwealth of the Bahamas","Americas","Caribbean","BSD","+1242",false,"Region"],
  ["BH","BHR","048","Bahrain","Kingdom of Bahrain","Asia","Western Asia","BHD","+973",true,"Region"],
  ["BD","BGD","050","Bangladesh","People's Republic of Bangladesh","Asia","Southern Asia","BDT","+880",true,"Region"],
  ["BB","BRB","052","Barbados","Barbados","Americas","Caribbean","BBD","+1246",true,"Region"],
  ["BY","BLR","112","Belarus","Republic of Belarus","Europe","Eastern Europe","BYN","+375",true,"Region"],
  ["BE","BEL","056","Belgium","Kingdom of Belgium","Europe","Western Europe","EUR","+32",true,"Region"],
  ["BZ","BLZ","084","Belize","Belize","Americas","Central America","BZD","+501",false,"Region"],
  ["BJ","BEN","204","Benin","Republic of Benin","Africa","Western Africa","XOF","+229",false,"Region"],
  ["BM","BMU","060","Bermuda","Bermuda","Americas","North America","BMD","+1441",true,"Region"],
  ["BT","BTN","064","Bhutan","Kingdom of Bhutan","Asia","Southern Asia","BTN","+975",false,"Region"],
  ["BO","BOL","068","Bolivia","Plurinational State of Bolivia","Americas","South America","BOB","+591",false,"Region"],
  ["BQ","BES","535","Caribbean Netherlands","Bonaire, Sint Eustatius and Saba","Americas","Caribbean","USD","+599",false,"Region"],
  ["BA","BIH","070","Bosnia and Herzegovina","Bosnia and Herzegovina","Europe","Southeast Europe","BAM","+387",true,"Region"],
  ["BW","BWA","072","Botswana","Republic of Botswana","Africa","Southern Africa","BWP","+267",false,"Region"],
  ["BV","BVT","074","Bouvet Island","Bouvet Island","Antarctic",null,null,"+47",false,"Region"],
  ["BR","BRA","076","Brazil","Federative Republic of Brazil","Americas","South America","BRL","+55",true,"State"],
  ["IO","IOT","086","British Indian Ocean Territory","British Indian Ocean Territory","Africa","Eastern Africa","USD","+246",false,"Region"],
  ["BN","BRN","096","Brunei","Nation of Brunei, Abode of Peace","Asia","South-Eastern Asia","BND","+673",true,"Region"],
  ["BG","BGR","100","Bulgaria","Republic of Bulgaria","Europe","Southeast Europe","BGN","+359",true,"Region"],
  ["BF","BFA","854","Burkina Faso","Burkina Faso","Africa","Western Africa","XOF","+226",false,"Region"],
  ["BI","BDI","108","Burundi","Republic of Burundi","Africa","Eastern Africa","BIF","+257",false,"Region"],
  ["CV","CPV","132","Cape Verde","Republic of Cabo Verde","Africa","Western Africa","CVE","+238",true,"Region"],
  ["KH","KHM","116","Cambodia","Kingdom of Cambodia","Asia","South-Eastern Asia","KHR","+855",true,"Region"],
  ["CM","CMR","120","Cameroon","Republic of Cameroon","Africa","Middle Africa","XAF","+237",false,"Region"],
  ["CA","CAN","124","Canada","Canada","Americas","North America","CAD","+1",true,"Province/Territory"],
  ["KY","CYM","136","Cayman Islands","Cayman Islands","Americas","Caribbean","KYD","+1345",false,"Region"],
  ["CF","CAF","140","Central African Republic","Central African Republic","Africa","Middle Africa","XAF","+236",false,"Region"],
  ["TD","TCD","148","Chad","Republic of Chad","Africa","Middle Africa","XAF","+235",false,"Region"],
  ["CL","CHL","152","Chile","Republic of Chile","Americas","South America","CLP","+56",true,"Region"],
  ["CN","CHN","156","China","People's Republic of China","Asia","Eastern Asia","CNY","+86",true,"Province"],
  ["CX","CXR","162","Christmas Island","Territory of Christmas Island","Oceania","Australia and New Zealand","AUD","+61",true,"Region"],
  ["CC","CCK","166","Cocos (Keeling) Islands","Territory of the Cocos (Keeling) Islands","Oceania","Australia and New Zealand","AUD","+61",false,"Region"],
  ["CO","COL","170","Colombia","Republic of Colombia","Americas","South America","COP","+57",false,"Department"],
  ["KM","COM","174","Comoros","Union of the Comoros","Africa","Eastern Africa","KMF","+269",false,"Region"],
  ["CD","COD","180","DR Congo","Democratic Republic of the Congo","Africa","Middle Africa","CDF","+243",false,"Region"],
  ["CG","COG","178","Republic of the Congo","Republic of the Congo","Africa","Middle Africa","XAF","+242",false,"Region"],
  ["CK","COK","184","Cook Islands","Cook Islands","Oceania","Polynesia","CKD","+682",false,"Region"],
  ["CR","CRI","188","Costa Rica","Republic of Costa Rica","Americas","Central America","CRC","+506",true,"Region"],
  ["CI","CIV","384","Ivory Coast","Republic of Côte d'Ivoire","Africa","Western Africa","XOF","+225",false,"Region"],
  ["HR","HRV","191","Croatia","Republic of Croatia","Europe","Southeast Europe","HRK","+385",true,"Region"],
  ["CU","CUB","192","Cuba","Republic of Cuba","Americas","Caribbean","CUC","+53",true,"Region"],
  ["CW","CUW","531","Curaçao","Country of Curaçao","Americas","Caribbean","ANG","+599",false,"Region"],
  ["CY","CYP","196","Cyprus","Republic of Cyprus","Europe","Southern Europe","EUR","+357",true,"Region"],
  ["CZ","CZE","203","Czechia","Czech Republic","Europe","Central Europe","CZK","+420",true,"Region"],
  ["DK","DNK","208","Denmark","Kingdom of Denmark","Europe","Northern Europe","DKK","+45",true,"Region"],
  ["DJ","DJI","262","Djibouti","Republic of Djibouti","Africa","Eastern Africa","DJF","+253",false,"Region"],
  ["DM","DMA","212","Dominica","Commonwealth of Dominica","Americas","Caribbean","XCD","+1767",false,"Region"],
  ["DO","DOM","214","Dominican Republic","Dominican Republic","Americas","Caribbean","DOP","+1",true,"Region"],
  ["EC","ECU","218","Ecuador","Republic of Ecuador","Americas","South America","USD","+593",true,"Region"],
  ["EG","EGY","818","Egypt","Arab Republic of Egypt","Africa","Northern Africa","EGP","+20",true,"Region"],
  ["SV","SLV","222","El Salvador","Republic of El Salvador","Americas","Central America","USD","+503",true,"Region"],
  ["GQ","GNQ","226","Equatorial Guinea","Republic of Equatorial Guinea","Africa","Middle Africa","XAF","+240",false,"Region"],
  ["ER","ERI","232","Eritrea","State of Eritrea","Africa","Eastern Africa","ERN","+291",false,"Region"],
  ["EE","EST","233","Estonia","Republic of Estonia","Europe","Northern Europe","EUR","+372",true,"Region"],
  ["SZ","SWZ","748","Eswatini","Kingdom of Eswatini","Africa","Southern Africa","SZL","+268",true,"Region"],
  ["ET","ETH","231","Ethiopia","Federal Democratic Republic of Ethiopia","Africa","Eastern Africa","ETB","+251",true,"Region"],
  ["FK","FLK","238","Falkland Islands","Falkland Islands","Americas","South America","FKP","+500",false,"Region"],
  ["FO","FRO","234","Faroe Islands","Faroe Islands","Europe","Northern Europe","DKK","+298",true,"Region"],
  ["FJ","FJI","242","Fiji","Republic of Fiji","Oceania","Melanesia","FJD","+679",false,"Region"],
  ["FI","FIN","246","Finland","Republic of Finland","Europe","Northern Europe","EUR","+358",true,"Region"],
  ["FR","FRA","250","France","French Republic","Europe","Western Europe","EUR","+33",true,"Region"],
  ["GF","GUF","254","French Guiana","Guiana","Americas","South America","EUR","+594",true,"Region"],
  ["PF","PYF","258","French Polynesia","French Polynesia","Oceania","Polynesia","XPF","+689",true,"Region"],
  ["TF","ATF","260","French Southern and Antarctic Lands","Territory of the French Southern and Antarctic Lands","Antarctic",null,"EUR","+262",false,"Region"],
  ["GA","GAB","266","Gabon","Gabonese Republic","Africa","Middle Africa","XAF","+241",false,"Region"],
  ["GM","GMB","270","Gambia","Republic of the Gambia","Africa","Western Africa","GMD","+220",false,"Region"],
  ["GE","GEO","268","Georgia","Georgia","Asia","Western Asia","GEL","+995",true,"Region"],
  ["DE","DEU","276","Germany","Federal Republic of Germany","Europe","Western Europe","EUR","+49",true,"State"],
  ["GH","GHA","288","Ghana","Republic of Ghana","Africa","Western Africa","GHS","+233",false,"Region"],
  ["GI","GIB","292","Gibraltar","Gibraltar","Europe","Southern Europe","GIP","+350",false,"Region"],
  ["GR","GRC","300","Greece","Hellenic Republic","Europe","Southern Europe","EUR","+30",true,"Region"],
  ["GL","GRL","304","Greenland","Greenland","Americas","North America","DKK","+299",true,"Region"],
  ["GD","GRD","308","Grenada","Grenada","Americas","Caribbean","XCD","+1473",false,"Region"],
  ["GP","GLP","312","Guadeloupe","Guadeloupe","Americas","Caribbean","EUR","+590",true,"Region"],
  ["GU","GUM","316","Guam","Guam","Oceania","Micronesia","USD","+1671",true,"Region"],
  ["GT","GTM","320","Guatemala","Republic of Guatemala","Americas","Central America","GTQ","+502",true,"Region"],
  ["GG","GGY","831","Guernsey","Bailiwick of Guernsey","Europe","Northern Europe","GBP","+44",true,"Region"],
  ["GN","GIN","324","Guinea","Republic of Guinea","Africa","Western Africa","GNF","+224",false,"Region"],
  ["GW","GNB","624","Guinea-Bissau","Republic of Guinea-Bissau","Africa","Western Africa","XOF","+245",true,"Region"],
  ["GY","GUY","328","Guyana","Co-operative Republic of Guyana","Americas","South America","GYD","+592",false,"Region"],
  ["HT","HTI","332","Haiti","Republic of Haiti","Americas","Caribbean","HTG","+509",true,"Region"],
  ["HM","HMD","334","Heard Island and McDonald Islands","Heard Island and McDonald Islands","Antarctic",null,null,null,false,"Region"],
  ["VA","VAT","336","Vatican City","Vatican City State","Europe","Southern Europe","EUR","+3",false,"Region"],
  ["HN","HND","340","Honduras","Republic of Honduras","Americas","Central America","HNL","+504",true,"Region"],
  ["HK","HKG","344","Hong Kong","Hong Kong Special Administrative Region of the People's Republic of China","Asia","Eastern Asia","HKD","+852",false,"Region"],
  ["HU","HUN","348","Hungary","Hungary","Europe","Central Europe","HUF","+36",true,"Region"],
  ["IS","ISL","352","Iceland","Iceland","Europe","Northern Europe","ISK","+354",true,"Region"],
  ["IN","IND","356","India","Republic of India","Asia","Southern Asia","INR","+91",true,"State"],
  ["ID","IDN","360","Indonesia","Republic of Indonesia","Asia","South-Eastern Asia","IDR","+62",true,"Province"],
  ["IR","IRN","364","Iran","Islamic Republic of Iran","Asia","Southern Asia","IRR","+98",true,"Region"],
  ["IQ","IRQ","368","Iraq","Republic of Iraq","Asia","Western Asia","IQD","+964",true,"Region"],
  ["IE","IRL","372","Ireland","Republic of Ireland","Europe","Northern Europe","EUR","+353",false,"County"],
  ["IM","IMN","833","Isle of Man","Isle of Man","Europe","Northern Europe","GBP","+44",true,"Region"],
  ["IL","ISR","376","Israel","State of Israel","Asia","Western Asia","ILS","+972",true,"Region"],
  ["IT","ITA","380","Italy","Italian Republic","Europe","Southern Europe","EUR","+39",true,"Region"],
  ["JM","JAM","388","Jamaica","Jamaica","Americas","Caribbean","JMD","+1876",false,"Region"],
  ["JP","JPN","392","Japan","Japan","Asia","Eastern Asia","JPY","+81",true,"Prefecture"],
  ["JE","JEY","832","Jersey","Bailiwick of Jersey","Europe","Northern Europe","GBP","+44",true,"Region"],
  ["JO","JOR","400","Jordan","Hashemite Kingdom of Jordan","Asia","Western Asia","JOD","+962",true,"Region"],
  ["KZ","KAZ","398","Kazakhstan","Republic of Kazakhstan","Asia","Central Asia","KZT","+7",true,"Region"],
  ["KE","KEN","404","Kenya","Republic of Kenya","Africa","Eastern Africa","KES","+254",true,"Region"],
  ["KI","KIR","296","Kiribati","Independent and Sovereign Republic of Kiribati","Oceania","Micronesia","AUD","+686",false,"Region"],
  ["KP","PRK","408","North Korea","Democratic People's Republic of Korea","Asia","Eastern Asia","KPW","+850",true,"Region"],
  ["KR","KOR","410","South Korea","Republic of Korea","Asia","Eastern Asia","KRW","+82",true,"Region"],
  ["KW","KWT","414","Kuwait","State of Kuwait","Asia","Western Asia","KWD","+965",true,"Region"],
  ["KG","KGZ","417","Kyrgyzstan","Kyrgyz Republic","Asia","Central Asia","KGS","+996",true,"Region"],
  ["LA","LAO","418","Laos","Lao People's Democratic Republic","Asia","South-Eastern Asia","LAK","+856",true,"Region"],
  ["LV","LVA","428","Latvia","Republic of Latvia","Europe","Northern Europe","EUR","+371",true,"Region"],
  ["LB","LBN","422","Lebanon","Lebanese Republic","Asia","Western Asia","LBP","+961",true,"Region"],
  ["LS","LSO","426","Lesotho","Kingdom of Lesotho","Africa","Southern Africa","LSL","+266",true,"Region"],
  ["LR","LBR","430","Liberia","Republic of Liberia","Africa","Western Africa","LRD","+231",true,"Region"],
  ["LY","LBY","434","Libya","State of Libya","Africa","Northern Africa","LYD","+218",false,"Region"],
  ["LI","LIE","438","Liechtenstein","Principality of Liechtenstein","Europe","Western Europe","CHF","+423",true,"Region"],
  ["LT","LTU","440","Lithuania","Republic of Lithuania","Europe","Northern Europe","EUR","+370",true,"Region"],
  ["LU","LUX","442","Luxembourg","Grand Duchy of Luxembourg","Europe","Western Europe","EUR","+352",true,"Region"],
  ["MO","MAC","446","Macau","Macao Special Administrative Region of the People's Republic of China","Asia","Eastern Asia","MOP","+853",false,"Region"],
  ["MK","MKD","807","North Macedonia","Republic of North Macedonia","Europe","Southeast Europe","MKD","+389",true,"Region"],
  ["MG","MDG","450","Madagascar","Republic of Madagascar","Africa","Eastern Africa","MGA","+261",true,"Region"],
  ["MW","MWI","454","Malawi","Republic of Malawi","Africa","Eastern Africa","MWK","+265",false,"Region"],
  ["MY","MYS","458","Malaysia","Malaysia","Asia","South-Eastern Asia","MYR","+60",true,"State"],
  ["MV","MDV","462","Maldives","Republic of the Maldives","Asia","Southern Asia","MVR","+960",true,"Region"],
  ["ML","MLI","466","Mali","Republic of Mali","Africa","Western Africa","XOF","+223",false,"Region"],
  ["MT","MLT","470","Malta","Republic of Malta","Europe","Southern Europe","EUR","+356",true,"Region"],
  ["MH","MHL","584","Marshall Islands","Republic of the Marshall Islands","Oceania","Micronesia","USD","+692",false,"Region"],
  ["MQ","MTQ","474","Martinique","Martinique","Americas","Caribbean","EUR","+596",true,"Region"],
  ["MR","MRT","478","Mauritania","Islamic Republic of Mauritania","Africa","Western Africa","MRU","+222",false,"Region"],
  ["MU","MUS","480","Mauritius","Republic of Mauritius","Africa","Eastern Africa","MUR","+230",false,"Region"],
  ["YT","MYT","175","Mayotte","Department of Mayotte","Africa","Eastern Africa","EUR","+262",true,"Region"],
  ["MX","MEX","484","Mexico","United Mexican States","Americas","North America","MXN","+52",true,"State"],
  ["FM","FSM","583","Micronesia","Federated States of Micronesia","Oceania","Micronesia","USD","+691",true,"Region"],
  ["MD","MDA","498","Moldova","Republic of Moldova","Europe","Eastern Europe","MDL","+373",true,"Region"],
  ["MC","MCO","492","Monaco","Principality of Monaco","Europe","Western Europe","EUR","+377",true,"Region"],
  ["MN","MNG","496","Mongolia","Mongolia","Asia","Eastern Asia","MNT","+976",true,"Region"],
  ["ME","MNE","499","Montenegro","Montenegro","Europe","Southeast Europe","EUR","+382",true,"Region"],
  ["MS","MSR","500","Montserrat","Montserrat","Americas","Caribbean","XCD","+1664",false,"Region"],
  ["MA","MAR","504","Morocco","Kingdom of Morocco","Africa","Northern Africa","MAD","+212",true,"Region"],
  ["MZ","MOZ","508","Mozambique","Republic of Mozambique","Africa","Eastern Africa","MZN","+258",true,"Region"],
  ["MM","MMR","104","Myanmar","Republic of the Union of Myanmar","Asia","South-Eastern Asia","MMK","+95",true,"Region"],
  ["NA","NAM","516","Namibia","Republic of Namibia","Africa","Southern Africa","NAD","+264",false,"Region"],
  ["NR","NRU","520","Nauru","Republic of Nauru","Oceania","Micronesia","AUD","+674",false,"Region"],
  ["NP","NPL","524","Nepal","Federal Democratic Republic of Nepal","Asia","Southern Asia","NPR","+977",true,"Region"],
  ["NL","NLD","528","Netherlands","Kingdom of the Netherlands","Europe","Western Europe","EUR","+31",true,"Province"],
  ["NC","NCL","540","New Caledonia","New Caledonia","Oceania","Melanesia","XPF","+687",true,"Region"],
  ["NZ","NZL","554","New Zealand","New Zealand","Oceania","Australia and New Zealand","NZD","+64",true,"Region"],
  ["NI","NIC","558","Nicaragua","Republic of Nicaragua","Americas","Central America","NIO","+505",true,"Region"],
  ["NE","NER","562","Niger","Republic of Niger","Africa","Western Africa","XOF","+227",true,"Region"],
  ["NG","NGA","566","Nigeria","Federal Republic of Nigeria","Africa","Western Africa","NGN","+234",true,"State"],
  ["NU","NIU","570","Niue","Niue","Oceania","Polynesia","NZD","+683",false,"Region"],
  ["NF","NFK","574","Norfolk Island","Territory of Norfolk Island","Oceania","Australia and New Zealand","AUD","+672",false,"Region"],
  ["MP","MNP","580","Northern Mariana Islands","Commonwealth of the Northern Mariana Islands","Oceania","Micronesia","USD","+1670",false,"Region"],
  ["NO","NOR","578","Norway","Kingdom of Norway","Europe","Northern Europe","NOK","+47",true,"Region"],
  ["OM","OMN","512","Oman","Sultanate of Oman","Asia","Western Asia","OMR","+968",true,"Region"],
  ["PK","PAK","586","Pakistan","Islamic Republic of Pakistan","Asia","Southern Asia","PKR","+92",true,"Province"],
  ["PW","PLW","585","Palau","Republic of Palau","Oceania","Micronesia","USD","+680",true,"Region"],
  ["PS","PSE","275","Palestine","State of Palestine","Asia","Western Asia","EGP","+970",false,"Region"],
  ["PA","PAN","591","Panama","Republic of Panama","Americas","Central America","PAB","+507",false,"Region"],
  ["PG","PNG","598","Papua New Guinea","Independent State of Papua New Guinea","Oceania","Melanesia","PGK","+675",true,"Region"],
  ["PY","PRY","600","Paraguay","Republic of Paraguay","Americas","South America","PYG","+595",true,"Region"],
  ["PE","PER","604","Peru","Republic of Peru","Americas","South America","PEN","+51",true,"Region"],
  ["PH","PHL","608","Philippines","Republic of the Philippines","Asia","South-Eastern Asia","PHP","+63",true,"Region"],
  ["PN","PCN","612","Pitcairn Islands","Pitcairn Group of Islands","Oceania","Polynesia","NZD","+64",false,"Region"],
  ["PL","POL","616","Poland","Republic of Poland","Europe","Central Europe","PLN","+48",true,"Region"],
  ["PT","PRT","620","Portugal","Portuguese Republic","Europe","Southern Europe","EUR","+351",true,"District"],
  ["PR","PRI","630","Puerto Rico","Commonwealth of Puerto Rico","Americas","Caribbean","USD","+1",true,"Region"],
  ["QA","QAT","634","Qatar","State of Qatar","Asia","Western Asia","QAR","+974",false,"Region"],
  ["RE","REU","638","Réunion","Réunion Island","Africa","Eastern Africa","EUR","+262",true,"Region"],
  ["RO","ROU","642","Romania","Romania","Europe","Southeast Europe","RON","+40",true,"Region"],
  ["RU","RUS","643","Russia","Russian Federation","Europe","Eastern Europe","RUB","+7",true,"Federal subject"],
  ["RW","RWA","646","Rwanda","Republic of Rwanda","Africa","Eastern Africa","RWF","+250",false,"Region"],
  ["BL","BLM","652","Saint Barthélemy","Collectivity of Saint Barthélemy","Americas","Caribbean","EUR","+590",true,"Region"],
  ["SH","SHN","654","Saint Helena, Ascension and Tristan da Cunha","Saint Helena, Ascension and Tristan da Cunha","Africa","Western Africa","GBP","+2",true,"Region"],
  ["KN","KNA","659","Saint Kitts and Nevis","Federation of Saint Christopher and Nevis","Americas","Caribbean","XCD","+1869",false,"Region"],
  ["LC","LCA","662","Saint Lucia","Saint Lucia","Americas","Caribbean","XCD","+1758",false,"Region"],
  ["MF","MAF","663","Saint Martin","Saint Martin","Americas","Caribbean","EUR","+590",true,"Region"],
  ["PM","SPM","666","Saint Pierre and Miquelon","Saint Pierre and Miquelon","Americas","North America","EUR","+508",true,"Region"],
  ["VC","VCT","670","Saint Vincent and the Grenadines","Saint Vincent and the Grenadines","Americas","Caribbean","XCD","+1784",false,"Region"],
  ["WS","WSM","882","Samoa","Independent State of Samoa","Oceania","Polynesia","WST","+685",false,"Region"],
  ["SM","SMR","674","San Marino","Republic of San Marino","Europe","Southern Europe","EUR","+378",true,"Region"],
  ["ST","STP","678","São Tomé and Príncipe","Democratic Republic of São Tomé and Príncipe","Africa","Middle Africa","STN","+239",false,"Region"],
  ["SA","SAU","682","Saudi Arabia","Kingdom of Saudi Arabia","Asia","Western Asia","SAR","+966",true,"Region"],
  ["SN","SEN","686","Senegal","Republic of Senegal","Africa","Western Africa","XOF","+221",true,"Region"],
  ["RS","SRB","688","Serbia","Republic of Serbia","Europe","Southeast Europe","RSD","+381",true,"Region"],
  ["SC","SYC","690","Seychelles","Republic of Seychelles","Africa","Eastern Africa","SCR","+248",false,"Region"],
  ["SL","SLE","694","Sierra Leone","Republic of Sierra Leone","Africa","Western Africa","SLL","+232",false,"Region"],
  ["SG","SGP","702","Singapore","Republic of Singapore","Asia","South-Eastern Asia","SGD","+65",true,"Region"],
  ["SX","SXM","534","Sint Maarten","Sint Maarten","Americas","Caribbean","ANG","+1721",false,"Region"],
  ["SK","SVK","703","Slovakia","Slovak Republic","Europe","Central Europe","EUR","+421",true,"Region"],
  ["SI","SVN","705","Slovenia","Republic of Slovenia","Europe","Central Europe","EUR","+386",true,"Region"],
  ["SB","SLB","090","Solomon Islands","Solomon Islands","Oceania","Melanesia","SBD","+677",false,"Region"],
  ["SO","SOM","706","Somalia","Federal Republic of Somalia","Africa","Eastern Africa","SOS","+252",true,"Region"],
  ["ZA","ZAF","710","South Africa","Republic of South Africa","Africa","Southern Africa","ZAR","+27",true,"Province"],
  ["GS","SGS","239","South Georgia","South Georgia and the South Sandwich Islands","Antarctic",null,"SHP","+500",false,"Region"],
  ["SS","SSD","728","South Sudan","Republic of South Sudan","Africa","Middle Africa","SSP","+211",false,"Region"],
  ["ES","ESP","724","Spain","Kingdom of Spain","Europe","Southern Europe","EUR","+34",true,"Autonomous community"],
  ["LK","LKA","144","Sri Lanka","Democratic Socialist Republic of Sri Lanka","Asia","Southern Asia","LKR","+94",true,"Region"],
  ["SD","SDN","729","Sudan","Republic of the Sudan","Africa","Northern Africa","SDG","+249",true,"Region"],
  ["SR","SUR","740","Suriname","Republic of Suriname","Americas","South America","SRD","+597",false,"Region"],
  ["SJ","SJM","744","Svalbard and Jan Mayen","Svalbard og Jan Mayen","Europe","Northern Europe","NOK","+4779",false,"Region"],
  ["SE","SWE","752","Sweden","Kingdom of Sweden","Europe","Northern Europe","SEK","+46",true,"Region"],
  ["CH","CHE","756","Switzerland","Swiss Confederation","Europe","Western Europe","CHF","+41",true,"Canton"],
  ["SY","SYR","760","Syria","Syrian Arab Republic","Asia","Western Asia","SYP","+963",false,"Region"],
  ["TW","TWN","158","Taiwan","Republic of China (Taiwan)","Asia","Eastern Asia","TWD","+886",true,"Region"],
  ["TJ","TJK","762","Tajikistan","Republic of Tajikistan","Asia","Central Asia","TJS","+992",true,"Region"],
  ["TZ","TZA","834","Tanzania","United Republic of Tanzania","Africa","Eastern Africa","TZS","+255",false,"Region"],
  ["TH","THA","764","Thailand","Kingdom of Thailand","Asia","South-Eastern Asia","THB","+66",true,"Province"],
  ["TL","TLS","626","Timor-Leste","Democratic Republic of Timor-Leste","Asia","South-Eastern Asia","USD","+670",false,"Region"],
  ["TG","TGO","768","Togo","Togolese Republic","Africa","Western Africa","XOF","+228",false,"Region"],
  ["TK","TKL","772","Tokelau","Tokelau","Oceania","Polynesia","NZD","+690",false,"Region"],
  ["TO","TON","776","Tonga","Kingdom of Tonga","Oceania","Polynesia","TOP","+676",false,"Region"],
  ["TT","TTO","780","Trinidad and Tobago","Republic of Trinidad and Tobago","Americas","Caribbean","TTD","+1868",false,"Region"],
  ["TN","TUN","788","Tunisia","Tunisian Republic","Africa","Northern Africa","TND","+216",true,"Region"],
  ["TR","TUR","792","Turkey","Republic of Turkey","Asia","Western Asia","TRY","+90",true,"Province"],
  ["TM","TKM","795","Turkmenistan","Turkmenistan","Asia","Central Asia","TMT","+993",true,"Region"],
  ["TC","TCA","796","Turks and Caicos Islands","Turks and Caicos Islands","Americas","Caribbean","USD","+1649",true,"Region"],
  ["TV","TUV","798","Tuvalu","Tuvalu","Oceania","Polynesia","AUD","+688",false,"Region"],
  ["UG","UGA","800","Uganda","Republic of Uganda","Africa","Eastern Africa","UGX","+256",false,"Region"],
  ["UA","UKR","804","Ukraine","Ukraine","Europe","Eastern Europe","UAH","+380",true,"Oblast"],
  ["AE","ARE","784","United Arab Emirates","United Arab Emirates","Asia","Western Asia","AED","+971",false,"Region"],
  ["GB","GBR","826","United Kingdom","United Kingdom of Great Britain and Northern Ireland","Europe","Northern Europe","GBP","+44",true,"Country"],
  ["UM","UMI","581","United States Minor Outlying Islands","United States Minor Outlying Islands","Americas","North America","USD","+268",false,"Region"],
  ["US","USA","840","United States","United States of America","Americas","North America","USD","+1",true,"State"],
  ["UY","URY","858","Uruguay","Oriental Republic of Uruguay","Americas","South America","UYU","+598",true,"Region"],
  ["UZ","UZB","860","Uzbekistan","Republic of Uzbekistan","Asia","Central Asia","UZS","+998",true,"Region"],
  ["VU","VUT","548","Vanuatu","Republic of Vanuatu","Oceania","Melanesia","VUV","+678",false,"Region"],
  ["VE","VEN","862","Venezuela","Bolivarian Republic of Venezuela","Americas","South America","VES","+58",true,"Region"],
  ["VN","VNM","704","Vietnam","Socialist Republic of Vietnam","Asia","South-Eastern Asia","VND","+84",true,"Region"],
  ["VG","VGB","092","British Virgin Islands","Virgin Islands","Americas","Caribbean","USD","+1284",false,"Region"],
  ["VI","VIR","850","United States Virgin Islands","Virgin Islands of the United States","Americas","Caribbean","USD","+1340",false,"Region"],
  ["WF","WLF","876","Wallis and Futuna","Territory of the Wallis and Futuna Islands","Oceania","Polynesia","XPF","+681",true,"Region"],
  ["EH","ESH","732","Western Sahara","Sahrawi Arab Democratic Republic","Africa","Northern Africa","DZD","+2",false,"Region"],
  ["YE","YEM","887","Yemen","Republic of Yemen","Asia","Western Asia","YER","+967",false,"Region"],
  ["ZM","ZMB","894","Zambia","Republic of Zambia","Africa","Eastern Africa","ZMW","+260",true,"Region"],
  ["ZW","ZWE","716","Zimbabwe","Republic of Zimbabwe","Africa","Southern Africa","ZWL","+263",false,"Region"]
];
const ledgerFamilies=[
  ['gl','General ledger',true],
  ['bank','Bank',false],
  ['customer','Customer',false],
  ['vendor','Vendor',false],
  ['employee','Employee',false],
  ['asset','Asset',false],
  ['project','Project',false],
  ['contract','Contract',false],
  ['loan','Loan',false]
];
const schemaField=(type,title,extra={})=>({type,title,...extra});
const dateField=title=>schemaField('string',title,{format:'date'});
const detailSchema=(tabs,properties,required=[])=>({
  type:'object',
  tabs,
  properties,
  required,
  additionalProperties:false
});
const ledgerFamilySchemas={
  asset:detailSchema([
    {label:'General',fields:['assetTag','assetCategory','serialNumber']},
    {label:'Dates',fields:['purchaseDate','commissionDate']},
    {label:'Assignment',fields:['custodian','location']},
    {label:'Depreciation',fields:['depreciationMethod','usefulLifeMonths','residualValue']}
  ],{
    assetTag:schemaField('string','Asset Tag'),
    assetCategory:schemaField('string','Asset Category'),
    serialNumber:schemaField('string','Serial Number'),
    purchaseDate:dateField('Purchase Date'),
    commissionDate:dateField('Commission Date'),
    custodian:schemaField('string','Custodian'),
    location:schemaField('string','Location'),
    depreciationMethod:schemaField('string','Depreciation Method'),
    usefulLifeMonths:schemaField('number','Useful Life Months'),
    residualValue:schemaField('number','Residual Value')
  }),
  bank:detailSchema([
    {label:'Bank',fields:['bankName','branchName','branchCode']},
    {label:'Account',fields:['accountNumber','accountName','accountType','currencyCode']},
    {label:'International',fields:['swiftCode','iban']}
  ],{
    bankName:schemaField('string','Bank Name'),
    branchName:schemaField('string','Branch Name'),
    branchCode:schemaField('string','Branch Code'),
    accountNumber:schemaField('string','Account Number'),
    accountName:schemaField('string','Account Name'),
    accountType:schemaField('string','Account Type'),
    swiftCode:schemaField('string','SWIFT Code'),
    iban:schemaField('string','IBAN'),
    currencyCode:schemaField('string','Currency Code')
  }),
  contract:detailSchema([
    {label:'General',fields:['contractNumber','contractType','counterpartyName']},
    {label:'Dates',fields:['startDate','endDate','renewalDate']},
    {label:'Value',fields:['contractValue','currencyCode','responsiblePerson']}
  ],{
    contractNumber:schemaField('string','Contract Number'),
    contractType:schemaField('string','Contract Type'),
    counterpartyName:schemaField('string','Counterparty Name'),
    startDate:dateField('Start Date'),
    endDate:dateField('End Date'),
    renewalDate:dateField('Renewal Date'),
    contractValue:schemaField('number','Contract Value'),
    currencyCode:schemaField('string','Currency Code'),
    responsiblePerson:schemaField('string','Responsible Person')
  }),
  loan:detailSchema([
    {label:'General',fields:['loanNumber','loanType','counterpartyRole']},
    {label:'Dates',fields:['startDate','maturityDate']},
    {label:'Terms',fields:['principalAmount','interestRate','currencyCode']}
  ],{
    loanNumber:schemaField('string','Loan Number'),
    loanType:schemaField('string','Loan Type'),
    counterpartyRole:schemaField('string','Counterparty Role'),
    startDate:dateField('Start Date'),
    maturityDate:dateField('Maturity Date'),
    principalAmount:schemaField('number','Principal Amount'),
    interestRate:schemaField('number','Interest Rate'),
    currencyCode:schemaField('string','Currency Code')
  }),
  customer:detailSchema([
    {label:'General',fields:['customerType','registrationNumber','taxNumber']},
    {label:'Contact',fields:['email','phone','billingAddress']},
    {label:'Credit',fields:['paymentTerms','creditLimit','currencyCode']}
  ],{
    customerType:schemaField('string','Customer Type'),
    registrationNumber:schemaField('string','Registration Number'),
    taxNumber:schemaField('string','Tax Number'),
    email:schemaField('string','Email',{format:'email'}),
    phone:schemaField('string','Phone'),
    billingAddress:schemaField('string','Billing Address',{format:'textarea'}),
    paymentTerms:schemaField('string','Payment Terms'),
    creditLimit:schemaField('number','Credit Limit'),
    currencyCode:schemaField('string','Currency Code')
  }),
  employee:detailSchema([
    {label:'Personal',fields:['employeeNumber','firstName','lastName','idNumber']},
    {label:'Contact',fields:['email','phone']},
    {label:'Employment',fields:['jobTitle','department','startDate','endDate']}
  ],{
    employeeNumber:schemaField('string','Employee Number'),
    firstName:schemaField('string','First Name'),
    lastName:schemaField('string','Last Name'),
    idNumber:schemaField('string','ID Number'),
    email:schemaField('string','Email',{format:'email'}),
    phone:schemaField('string','Phone'),
    jobTitle:schemaField('string','Job Title'),
    department:schemaField('string','Department'),
    startDate:dateField('Start Date'),
    endDate:dateField('End Date')
  }),
  gl:detailSchema([
    {label:'Reporting',fields:['reportingCategory','cashFlowCategory','taxCategory']},
    {label:'Controls',fields:['reconciliationRequired','budgetControl']}
  ],{
    reportingCategory:schemaField('string','Reporting Category'),
    cashFlowCategory:schemaField('string','Cash Flow Category'),
    taxCategory:schemaField('string','Tax Category'),
    reconciliationRequired:schemaField('boolean','Reconciliation Required'),
    budgetControl:schemaField('boolean','Budget Control')
  }),
  project:detailSchema([
    {label:'General',fields:['projectCode','projectType','projectManager','status']},
    {label:'Dates',fields:['startDate','endDate']},
    {label:'Budget',fields:['budgetAmount','currencyCode']}
  ],{
    projectCode:schemaField('string','Project Code'),
    projectType:schemaField('string','Project Type'),
    projectManager:schemaField('string','Project Manager'),
    startDate:dateField('Start Date'),
    endDate:dateField('End Date'),
    budgetAmount:schemaField('number','Budget Amount'),
    currencyCode:schemaField('string','Currency Code'),
    status:schemaField('string','Status')
  }),
  vendor:detailSchema([
    {label:'General',fields:['vendorType','registrationNumber','taxNumber']},
    {label:'Contact',fields:['email','phone']},
    {label:'Payment',fields:['paymentTerms','bankAccountName','bankAccountNumber','currencyCode']}
  ],{
    vendorType:schemaField('string','Vendor Type'),
    registrationNumber:schemaField('string','Registration Number'),
    taxNumber:schemaField('string','Tax Number'),
    email:schemaField('string','Email',{format:'email'}),
    phone:schemaField('string','Phone'),
    paymentTerms:schemaField('string','Payment Terms'),
    bankAccountName:schemaField('string','Bank Account Name'),
    bankAccountNumber:schemaField('string','Bank Account Number'),
    currencyCode:schemaField('string','Currency Code')
  })
};
const roleSeeds=[
  ['erp_admin','ERP Administrator','Full administrator role seeded for the template organisation.',true],
  ['organisation_finance_manager','Organisation Finance Manager','Whole-organisation finance manager role.',false],
  ['organisation_finance_clerk','Organisation Finance Clerk','Whole-organisation finance capture role.',false],
  ['organisation_approver','Organisation Approver','Whole-organisation transaction approval role.',false],
  ['organisation_master_data_manager','Organisation Master Data Manager','Whole-organisation master data management role.',false],
  ['organisation_reporting_user','Organisation Reporting User','Whole-organisation read-only reporting role.',false],
  ['organisation_auditor','Organisation Auditor','Whole-organisation audit read-only role.',false],
  ['organisation_sales_user','Organisation Sales User','Whole-organisation sales transaction role.',false],
  ['organisation_procurement_user','Organisation Procurement User','Whole-organisation procurement transaction role.',false]
];
const rolePermissionSeeds=[
  ['erp_admin','master_data','*','view'],
  ['erp_admin','master_data','*','*'],
  ['erp_admin','transaction','*','view'],
  ['erp_admin','transaction','*','*'],
  ['organisation_finance_manager','master_data','*','view'],
  ['organisation_finance_manager','master_data','*','*'],
  ['organisation_finance_manager','transaction','*','view'],
  ['organisation_finance_manager','transaction','*','*'],
  ['organisation_finance_clerk','master_data','*','view'],
  ['organisation_finance_clerk','master_data','*','approved'],
  ['organisation_finance_clerk','transaction','*','view'],
  ['organisation_finance_clerk','transaction','*','draft'],
  ['organisation_finance_clerk','transaction','*','submitted'],
  ['organisation_approver','master_data','*','view'],
  ['organisation_approver','master_data','*','approved'],
  ['organisation_approver','transaction','*','view'],
  ['organisation_approver','transaction','*','submitted'],
  ['organisation_approver','transaction','*','approved'],
  ['organisation_approver','transaction','*','rejected'],
  ['organisation_master_data_manager','master_data','*','view'],
  ['organisation_master_data_manager','master_data','*','*'],
  ['organisation_master_data_manager','transaction','*','view'],
  ['organisation_reporting_user','master_data','*','view'],
  ['organisation_reporting_user','transaction','*','view'],
  ['organisation_auditor','master_data','*','view'],
  ['organisation_auditor','transaction','*','view'],
  ['organisation_sales_user','master_data','customer','view'],
  ['organisation_sales_user','master_data','customer','approved'],
  ['organisation_sales_user','master_data','project','view'],
  ['organisation_sales_user','master_data','project','approved'],
  ['organisation_sales_user','master_data','contract','view'],
  ['organisation_sales_user','master_data','contract','approved'],
  ['organisation_sales_user','transaction','sales','view'],
  ['organisation_sales_user','transaction','sales','draft'],
  ['organisation_sales_user','transaction','sales','submitted'],
  ['organisation_procurement_user','master_data','vendor','view'],
  ['organisation_procurement_user','master_data','vendor','approved'],
  ['organisation_procurement_user','master_data','asset','view'],
  ['organisation_procurement_user','master_data','asset','approved'],
  ['organisation_procurement_user','master_data','project','view'],
  ['organisation_procurement_user','master_data','project','approved'],
  ['organisation_procurement_user','master_data','contract','view'],
  ['organisation_procurement_user','master_data','contract','approved'],
  ['organisation_procurement_user','transaction','purchasing','view'],
  ['organisation_procurement_user','transaction','purchasing','draft'],
  ['organisation_procurement_user','transaction','purchasing','submitted'],
  ['organisation_procurement_user','transaction','assets','view'],
  ['organisation_procurement_user','transaction','assets','draft'],
  ['organisation_procurement_user','transaction','assets','submitted']
];
const transactionGroups=[
  ['sales','Sales',10],
  ['purchasing','Purchasing',20],
  ['banking','Banking',30],
  ['tax','Tax',40],
  ['payroll','Payroll',50],
  ['inventory','Inventory',60],
  ['assets','Assets',70],
  ['loans','Loans',80],
  ['intercompany','Intercompany',90],
  ['journal','Journals',100]
];
const transactionTypes=[
  ['manual_journal','journal','Manual journal','General journal capture.',100],
  ['cash_sale','sales','Cash sale','Immediate sale settled through cash or bank.',110],
  ['customer_invoice','sales','Customer invoice','Sale on account through accounts receivable.',120],
  ['customer_payment','sales','Customer payment','Receipt from a customer subledger.',130],
  ['supplier_invoice','purchasing','Purchase on account','Supplier purchase through accounts payable.',210],
  ['supplier_payment','purchasing','Supplier payment','Payment to a vendor subledger.',220],
  ['bank_charge','banking','Bank charge','Bank fee or service charge.',310],
  ['bank_deposit','banking','Bank deposit','Non-customer bank deposit.',320],
  ['bank_withdrawal','banking','Bank withdrawal','Non-vendor bank withdrawal.',330],
  ['tax_accrual','tax','Tax accrual','Tax liability accrual.',410],
  ['tax_payment','tax','Tax payment','Payment against tax liability.',420],
  ['payroll_accrual','payroll','Payroll accrual','Payroll liability recognition.',510],
  ['payroll_payment','payroll','Payroll payment','Payroll settlement.',520],
  ['asset_purchase_cash','assets','Asset purchase cash','Asset bought and paid immediately.',710],
  ['asset_purchase_account','assets','Asset purchase on account','Asset bought through accounts payable.',720],
  ['depreciation','assets','Depreciation','Periodic depreciation posting.',730],
  ['loan_received','loans','Loan received','Loan funding received.',810],
  ['loan_repayment_principal','loans','Loan repayment principal','Principal repayment.',820],
  ['loan_interest_payment','loans','Loan interest payment','Interest repayment.',830]
];
const postingRuleSeeds=[
  ['manual_journal',1,'debit','1010',false,null,'Manual journal debit'],
  ['manual_journal',2,'credit','1010',false,null,'Manual journal credit'],
  ['cash_sale',1,'debit','1000',false,null,'Cash received'],
  ['cash_sale',2,'credit','4000',false,null,'Sales revenue'],
  ['customer_invoice',1,'debit','1100',true,'customer','Customer receivable'],
  ['customer_invoice',2,'credit','4000',false,null,'Sales revenue'],
  ['customer_payment',1,'debit','1000',false,null,'Cash received'],
  ['customer_payment',2,'credit','1100',true,'customer','Customer receivable settlement'],
  ['supplier_invoice',1,'debit','5600',false,null,'Purchase expense'],
  ['supplier_invoice',2,'credit','2000',true,'vendor','Vendor payable'],
  ['supplier_payment',1,'debit','2000',true,'vendor','Vendor payable settlement'],
  ['supplier_payment',2,'credit','1000',false,null,'Cash paid'],
  ['bank_charge',1,'debit','5100',false,null,'Bank charge expense'],
  ['bank_charge',2,'credit','1000',false,null,'Bank account'],
  ['bank_deposit',1,'debit','1000',false,null,'Bank deposit'],
  ['bank_deposit',2,'credit','4100',false,null,'Other income'],
  ['bank_withdrawal',1,'debit','2050',false,null,'Withdrawal expense or accrual'],
  ['bank_withdrawal',2,'credit','1000',false,null,'Bank account'],
  ['tax_accrual',1,'debit','5400',false,null,'Tax expense'],
  ['tax_accrual',2,'credit','2400',false,null,'Tax payable'],
  ['tax_payment',1,'debit','2400',false,null,'Tax payable settlement'],
  ['tax_payment',2,'credit','1000',false,null,'Cash paid'],
  ['payroll_accrual',1,'debit','5200',false,null,'Payroll expense'],
  ['payroll_accrual',2,'credit','2300',true,'employee','Payroll liability'],
  ['payroll_payment',1,'debit','2300',true,'employee','Payroll liability settlement'],
  ['payroll_payment',2,'credit','1000',false,null,'Cash paid'],
  ['asset_purchase_cash',1,'debit','1300',false,null,'Fixed asset'],
  ['asset_purchase_cash',2,'credit','1000',false,null,'Cash paid'],
  ['asset_purchase_account',1,'debit','1300',false,null,'Fixed asset'],
  ['asset_purchase_account',2,'credit','2000',true,'vendor','Vendor payable'],
  ['depreciation',1,'debit','5300',false,null,'Depreciation expense'],
  ['depreciation',2,'credit','1350',false,null,'Accumulated depreciation'],
  ['loan_received',1,'debit','1000',false,null,'Cash received'],
  ['loan_received',2,'credit','2500',true,'loan','Loan payable'],
  ['loan_repayment_principal',1,'debit','2500',true,'loan','Loan payable principal'],
  ['loan_repayment_principal',2,'credit','1000',false,null,'Cash paid'],
  ['loan_interest_payment',1,'debit','5500',true,'loan','Interest expense'],
  ['loan_interest_payment',2,'credit','1000',false,null,'Cash paid']
];
const chartTemplate=[
  ['1000','Cash','asset',true,'bank'],
  ['1010','Bank Clearing','asset',true,'bank'],
  ['1100','Accounts Receivable','asset',true,'customer'],
  ['1150','Customer Advances','liability',true,'customer'],
  ['1200','Inventory','asset',false,null],
  ['1300','Fixed Assets','asset',false,null],
  ['1350','Accumulated Depreciation','asset',false,null],
  ['2000','Accounts Payable','liability',true,'vendor'],
  ['2050','Accrued Expenses','liability',false,null],
  ['2100','VAT Output','liability',false,null],
  ['2200','VAT Input','asset',false,null],
  ['2250','VAT Control','liability',false,null],
  ['2300','Payroll Liability','liability',true,'employee'],
  ['2400','Tax Payable','liability',false,null],
  ['2500','Loan Payable','liability',false,null],
  ['3000','Owner Equity','equity',false,null],
  ['3100','Retained Earnings','equity',false,null],
  ['4000','Sales Revenue','revenue',false,null],
  ['4100','Other Income','revenue',false,null],
  ['5000','Cost of Sales','expense',false,null],
  ['5050','Inventory Adjustments','expense',false,null],
  ['5100','Bank Charges','expense',false,null],
  ['5200','Payroll Expense','expense',false,null],
  ['5300','Depreciation Expense','expense',false,null],
  ['5400','Tax Expense','expense',false,null],
  ['5500','Interest Expense','expense',false,null],
  ['5600','Purchase Expense','expense',false,null]
];
const customerSchema={
  type:'object',
  properties:{
    knownName:{type:'string',title:'Known name','x-searchable':true,'x-reportable':true,'x-listView':true},
    legalName:{type:'string',title:'Legal name','x-searchable':true,'x-reportable':true,'x-listView':true},
    registrationNumber:{type:'string',title:'Registration number','x-searchable':true},
    taxNumber:{type:'string',title:'Tax number','x-searchable':true},
    addressList:{type:'array',title:'Addresses',items:{type:'object'}},
    directorList:{type:'array',title:'Directors',items:{type:'object'}},
    creditLimits:{type:'array',title:'Credit limits',items:{type:'object'}},
    contacts:{type:'array',title:'Contacts',items:{type:'object'}}
  },
  required:['knownName','legalName'],
  additionalProperties:false
};
const customerUiSchema={
  sections:[
    {key:'general',title:'General',fields:['knownName','legalName','registrationNumber','taxNumber']},
    {key:'addresses',title:'Addresses',fields:['addressList']},
    {key:'directors',title:'Directors',fields:['directorList']},
    {key:'credit',title:'Credit',fields:['creditLimits']},
    {key:'contacts',title:'Contacts',fields:['contacts']}
  ]
};

let schemaReady=false;
let schemaPromise=null;

async function ensureSchema(ctx){
  if(schemaReady)return;
  if(!schemaPromise){
    schemaPromise=ensureSchemaUncached(ctx).then(()=>{schemaReady=true;}).catch(error=>{
      schemaPromise=null;
      throw error;
    });
  }
  return schemaPromise;
}

async function ensureSchemaUncached(ctx){
  await ctx.broker('core_erp','query',{text:`
    SELECT pg_advisory_xact_lock(hashtext('erp_schema'));
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS erp_organisation(
      organisation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_code text NOT NULL,
      organisation_name text NOT NULL,
      is_template boolean NOT NULL DEFAULT false,
      base_currency_code text NOT NULL DEFAULT 'ZAR',
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      archived_at timestamptz,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_organisation_live_code_idx ON erp_organisation(tenant_id,organisation_code) WHERE workflow_status <> 'deleted';

    CREATE TABLE IF NOT EXISTS erp_division(
      division_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      parent_division_id uuid REFERENCES erp_division(division_id),
      division_code text NOT NULL,
      division_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      created_by_email text,
      updated_by_email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_division_live_code_idx ON erp_division(tenant_id,organisation_id,division_code) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_division_parent_idx ON erp_division(tenant_id,organisation_id,parent_division_id,division_name);

    CREATE TABLE IF NOT EXISTS erp_legal_entity(
      legal_entity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      entity_type text NOT NULL DEFAULT 'company',
      legal_name text NOT NULL,
      known_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_legal_entity_live_known_name_idx ON erp_legal_entity(tenant_id,organisation_id,lower(known_name)) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_legal_entity_lookup_idx ON erp_legal_entity(tenant_id,organisation_id,workflow_status,known_name);

    CREATE TABLE IF NOT EXISTS erp_legal_entity_identification(
      identification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      identification_type text NOT NULL,
      identification_number text NOT NULL,
      issuing_authority text,
      country_code text,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS erp_legal_entity_identification_lookup_idx ON erp_legal_entity_identification(tenant_id,organisation_id,legal_entity_id,identification_type,valid_from,valid_to);
    CREATE UNIQUE INDEX IF NOT EXISTS erp_legal_entity_identification_period_idx ON erp_legal_entity_identification(tenant_id,organisation_id,legal_entity_id,identification_type,valid_from) WHERE is_active=true;

    CREATE TABLE IF NOT EXISTS erp_legal_entity_address(
      address_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      address_type text NOT NULL,
      address_line1 text NOT NULL,
      address_line2 text,
      city text,
      region text,
      postal_code text,
      country_code text,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS erp_legal_entity_address_lookup_idx ON erp_legal_entity_address(tenant_id,organisation_id,legal_entity_id,address_type,is_primary);

    CREATE TABLE IF NOT EXISTS erp_legal_entity_relationship(
      relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      from_legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      to_legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      relationship_type text NOT NULL,
      role_title text,
      ownership_percentage numeric(9,4),
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(from_legal_entity_id <> to_legal_entity_id)
    );
    CREATE INDEX IF NOT EXISTS erp_legal_entity_relationship_from_idx ON erp_legal_entity_relationship(tenant_id,organisation_id,from_legal_entity_id,relationship_type);
    CREATE INDEX IF NOT EXISTS erp_legal_entity_relationship_to_idx ON erp_legal_entity_relationship(tenant_id,organisation_id,to_legal_entity_id,relationship_type);

    CREATE TABLE IF NOT EXISTS erp_currency(
      currency_code text PRIMARY KEY,
      currency_name text NOT NULL,
      decimal_places integer NOT NULL DEFAULT 2,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS erp_country(
      country_code text PRIMARY KEY,
      country_name text NOT NULL,
      official_name text,
      alpha3_code text,
      numeric_code text,
      region text,
      subregion text,
      default_currency_code text,
      calling_code text,
      postal_code_required boolean NOT NULL DEFAULT false,
      administrative_level_label text,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS official_name text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS alpha3_code text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS numeric_code text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS region text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS subregion text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS default_currency_code text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS calling_code text;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS postal_code_required boolean NOT NULL DEFAULT false;
    ALTER TABLE erp_country ADD COLUMN IF NOT EXISTS administrative_level_label text;
    DO $$
    DECLARE constraint_name text;
    BEGIN
      SELECT c.conname INTO constraint_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
      WHERE t.relname='erp_country'
      AND a.attname='default_currency_code'
      AND c.contype='f'
      LIMIT 1;
      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE erp_country DROP CONSTRAINT %I',constraint_name);
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS erp_fiscal_year(
      fiscal_year_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      fiscal_year_code text NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK(status IN('open','soft_closed','closed','locked')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,fiscal_year_code)
    );

    CREATE TABLE IF NOT EXISTS erp_fiscal_period(
      fiscal_period_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      fiscal_year_id uuid NOT NULL REFERENCES erp_fiscal_year(fiscal_year_id) ON DELETE CASCADE,
      period_number integer NOT NULL,
      period_code text NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK(status IN('open','soft_closed','closed','locked')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,fiscal_year_id,period_number)
    );

    CREATE TABLE IF NOT EXISTS erp_ledger_family(
      ledger_family_code text PRIMARY KEY,
      family_name text NOT NULL,
      requires_standard_account_type boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS erp_organisation_currency(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      currency_code text NOT NULL REFERENCES erp_currency(currency_code),
      currency_name text NOT NULL,
      decimal_places integer NOT NULL DEFAULT 2,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id,currency_code)
    );

    CREATE TABLE IF NOT EXISTS erp_organisation_country(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      country_code text NOT NULL REFERENCES erp_country(country_code),
      country_name text NOT NULL,
      official_name text,
      alpha3_code text,
      numeric_code text,
      region text,
      subregion text,
      default_currency_code text,
      calling_code text,
      postal_code_required boolean NOT NULL DEFAULT false,
      administrative_level_label text,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id,country_code)
    );

    CREATE TABLE IF NOT EXISTS erp_organisation_ledger_family(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL REFERENCES erp_ledger_family(ledger_family_code),
      family_name text NOT NULL,
      requires_standard_account_type boolean NOT NULL DEFAULT false,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id,ledger_family_code)
    );
    ALTER TABLE erp_organisation_ledger_family ADD COLUMN IF NOT EXISTS schema_json jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS erp_ledger_account_type(
      account_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL REFERENCES erp_ledger_family(ledger_family_code),
      account_type_code text NOT NULL,
      account_type_name text NOT NULL,
      is_required boolean NOT NULL DEFAULT false,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_account_type_live_idx ON erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code) WHERE is_active=true;

    CREATE TABLE IF NOT EXISTS erp_ledger_account(
      ledger_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      ledger_family_code text NOT NULL REFERENCES erp_ledger_family(ledger_family_code),
      account_code text NOT NULL,
      account_name text NOT NULL,
      account_type_id uuid REFERENCES erp_ledger_account_type(account_type_id),
      legal_entity_id uuid REFERENCES erp_legal_entity(legal_entity_id),
      requires_subledger boolean NOT NULL DEFAULT false,
      required_subledger_family_code text REFERENCES erp_ledger_family(ledger_family_code),
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE erp_ledger_account ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES erp_legal_entity(legal_entity_id);
    CREATE UNIQUE INDEX IF NOT EXISTS erp_ledger_account_live_code_idx ON erp_ledger_account(tenant_id,organisation_id,ledger_family_code,account_code) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_ledger_account_lookup_idx ON erp_ledger_account(tenant_id,organisation_id,ledger_family_code,workflow_status,account_name);
    CREATE INDEX IF NOT EXISTS erp_ledger_account_legal_entity_idx ON erp_ledger_account(tenant_id,organisation_id,legal_entity_id,ledger_family_code) WHERE workflow_status <> 'deleted';

    CREATE TABLE IF NOT EXISTS erp_master_data_type(
      master_data_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL REFERENCES erp_ledger_family(ledger_family_code),
      type_code text NOT NULL,
      type_name text NOT NULL,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ui_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      schema_version integer NOT NULL DEFAULT 1,
      workflow_status text NOT NULL DEFAULT 'approved' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_master_data_record(
      master_data_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      master_data_type_id uuid NOT NULL REFERENCES erp_master_data_type(master_data_type_id),
      ledger_account_id uuid REFERENCES erp_ledger_account(ledger_account_id),
      record_code text NOT NULL,
      display_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      schema_version integer NOT NULL DEFAULT 1,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      top_level_search jsonb NOT NULL DEFAULT '{}'::jsonb,
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_master_data_record_live_code_idx ON erp_master_data_record(tenant_id,organisation_id,master_data_type_id,record_code) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_master_data_record_search_idx ON erp_master_data_record USING gin(top_level_search);

    CREATE TABLE IF NOT EXISTS erp_transaction_group(
      transaction_group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      group_code text NOT NULL,
      group_name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      UNIQUE(tenant_id,organisation_id,group_code)
    );

    CREATE TABLE IF NOT EXISTS erp_transaction_type(
      transaction_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      transaction_group_id uuid NOT NULL REFERENCES erp_transaction_group(transaction_group_id) ON DELETE CASCADE,
      type_code text NOT NULL,
      type_name text NOT NULL,
      type_description text NOT NULL DEFAULT '',
      is_financial boolean NOT NULL DEFAULT true,
      allow_additional_lines boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_posting_rule(
      posting_rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      transaction_type_id uuid NOT NULL REFERENCES erp_transaction_type(transaction_type_id) ON DELETE CASCADE,
      line_order integer NOT NULL DEFAULT 0,
      debit_credit text NOT NULL CHECK(debit_credit IN('debit','credit')),
      default_gl_account_id uuid REFERENCES erp_ledger_account(ledger_account_id),
      requires_subledger boolean NOT NULL DEFAULT false,
      subledger_family_code text REFERENCES erp_ledger_family(ledger_family_code),
      amount_source text NOT NULL DEFAULT 'manual',
      line_description text NOT NULL DEFAULT '',
      is_required boolean NOT NULL DEFAULT true,
      UNIQUE(transaction_type_id,line_order)
    );
    ALTER TABLE erp_transaction_type ADD COLUMN IF NOT EXISTS is_financial boolean NOT NULL DEFAULT true;
    ALTER TABLE erp_posting_rule ADD COLUMN IF NOT EXISTS requires_subledger boolean NOT NULL DEFAULT false;
    ALTER TABLE erp_posting_rule ADD COLUMN IF NOT EXISTS subledger_family_code text REFERENCES erp_ledger_family(ledger_family_code);

    CREATE TABLE IF NOT EXISTS erp_journal(
      journal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id),
      transaction_type_id uuid REFERENCES erp_transaction_type(transaction_type_id),
      fiscal_period_id uuid NOT NULL REFERENCES erp_fiscal_period(fiscal_period_id),
      source_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      journal_number text,
      journal_date date NOT NULL DEFAULT CURRENT_DATE,
      description text NOT NULL DEFAULT '',
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','deleted','reversed')),
      currency_code text NOT NULL REFERENCES erp_currency(currency_code),
      exchange_rate numeric(18,8) NOT NULL DEFAULT 1,
      reversing_journal_id uuid REFERENCES erp_journal(journal_id),
      created_by_email text,
      updated_by_email text,
      submitted_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      reversed_by_email text,
      reversed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    DO $$
    DECLARE constraint_name text;
    BEGIN
      SELECT conname INTO constraint_name
      FROM pg_constraint
      WHERE conrelid='erp_journal'::regclass
        AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%workflow_status%'
      LIMIT 1;
      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE erp_journal DROP CONSTRAINT %I',constraint_name);
      END IF;
      ALTER TABLE erp_journal ADD CONSTRAINT erp_journal_workflow_status_check CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','deleted','reversed'));
    END $$;
    CREATE INDEX IF NOT EXISTS erp_journal_lookup_idx ON erp_journal(tenant_id,organisation_id,workflow_status,journal_date DESC);

    CREATE TABLE IF NOT EXISTS erp_journal_line(
      journal_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id),
      journal_id uuid NOT NULL REFERENCES erp_journal(journal_id) ON DELETE CASCADE,
      line_number integer NOT NULL,
      division_id uuid NOT NULL REFERENCES erp_division(division_id),
      gl_account_id uuid NOT NULL REFERENCES erp_ledger_account(ledger_account_id),
      subledger_account_id uuid REFERENCES erp_ledger_account(ledger_account_id),
      description text NOT NULL DEFAULT '',
      debit_amount numeric(18,2) NOT NULL DEFAULT 0,
      credit_amount numeric(18,2) NOT NULL DEFAULT 0,
      currency_code text NOT NULL REFERENCES erp_currency(currency_code),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK(debit_amount >= 0 AND credit_amount >= 0),
      CHECK((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
    );
    CREATE INDEX IF NOT EXISTS erp_journal_line_subledger_idx ON erp_journal_line(tenant_id,organisation_id,subledger_account_id);

    CREATE TABLE IF NOT EXISTS erp_role(
      role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      role_code text NOT NULL,
      role_name text NOT NULL,
      role_description text NOT NULL DEFAULT '',
      is_admin boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      UNIQUE(tenant_id,organisation_id,role_code)
    );
    ALTER TABLE erp_role ADD COLUMN IF NOT EXISTS role_description text NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS erp_role_permission(
      role_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES erp_role(role_id) ON DELETE CASCADE,
      division_id uuid REFERENCES erp_division(division_id),
      resource_kind text NOT NULL,
      resource_code text NOT NULL DEFAULT '*',
      workflow_status text NOT NULL DEFAULT '*',
      action_code text NOT NULL,
      applies_to_children boolean NOT NULL DEFAULT true,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date
    );

    CREATE TABLE IF NOT EXISTS erp_user_role(
      user_role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES erp_role(role_id) ON DELETE CASCADE,
      email text NOT NULL,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      UNIQUE(tenant_id,organisation_id,role_id,email)
    );
  `});
}

async function seedGlobal(ctx){
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_currency(currency_code,currency_name,decimal_places,is_seeded,is_active)
          SELECT currency_code,currency_name,decimal_places,is_seeded,true
          FROM jsonb_to_recordset($1::jsonb) AS row(currency_code text,currency_name text,decimal_places integer,is_seeded boolean)
          ON CONFLICT(currency_code) DO UPDATE
          SET currency_name=excluded.currency_name,decimal_places=excluded.decimal_places,is_seeded=excluded.is_seeded,is_active=true,updated_at=now()`,
    values:[JSON.stringify(currencies.map(([currency_code,currency_name,decimal_places,is_seeded])=>({currency_code,currency_name,decimal_places,is_seeded})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_country(country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_seeded,is_active)
          SELECT country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,true,true
          FROM jsonb_to_recordset($1::jsonb) AS row(country_code text,alpha3_code text,numeric_code text,country_name text,official_name text,region text,subregion text,default_currency_code text,calling_code text,postal_code_required boolean,administrative_level_label text)
          ON CONFLICT(country_code) DO UPDATE
          SET alpha3_code=excluded.alpha3_code,
              numeric_code=excluded.numeric_code,
              country_name=excluded.country_name,
              official_name=excluded.official_name,
              region=excluded.region,
              subregion=excluded.subregion,
              default_currency_code=excluded.default_currency_code,
              calling_code=excluded.calling_code,
              postal_code_required=excluded.postal_code_required,
              administrative_level_label=excluded.administrative_level_label,
              is_seeded=excluded.is_seeded,
              is_active=true,
              updated_at=now()`,
    values:[JSON.stringify(countries.map(([country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label])=>({country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_ledger_family(ledger_family_code,family_name,requires_standard_account_type,is_active)
          SELECT ledger_family_code,family_name,requires_standard_account_type,true
          FROM jsonb_to_recordset($1::jsonb) AS row(ledger_family_code text,family_name text,requires_standard_account_type boolean)
          ON CONFLICT(ledger_family_code) DO UPDATE
          SET family_name=excluded.family_name,requires_standard_account_type=excluded.requires_standard_account_type,is_active=true`,
    values:[JSON.stringify(ledgerFamilies.map(([ledger_family_code,family_name,requires_standard_account_type])=>({ledger_family_code,family_name,requires_standard_account_type})))]
  });
}

async function ensureTenantSeed(ctx,access){
  await ensureSchema(ctx);
}

async function seedOrganisationDefaults(ctx,access,organisationId){
  const org=await ctx.broker('core_erp','query',{
    text:`SELECT is_template FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`,
    values:[access.tenantId,organisationId]
  });
  if(!org.rows[0]?.is_template)return;
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_organisation_currency(tenant_id,organisation_id,currency_code,currency_name,decimal_places,is_seeded,is_active)
          SELECT $1,$2,currency_code,currency_name,decimal_places,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(currency_code text,currency_name text,decimal_places integer,is_seeded boolean)
          ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
          SET currency_name=excluded.currency_name,
              decimal_places=excluded.decimal_places,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(currencies.map(([currency_code,currency_name,decimal_places,is_seeded])=>({currency_code,currency_name,decimal_places,is_seeded})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_organisation_country(tenant_id,organisation_id,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_seeded,is_active)
          SELECT $1,$2,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(country_code text,alpha3_code text,numeric_code text,country_name text,official_name text,region text,subregion text,default_currency_code text,calling_code text,postal_code_required boolean,administrative_level_label text)
          ON CONFLICT(tenant_id,organisation_id,country_code) DO UPDATE
          SET alpha3_code=excluded.alpha3_code,
              numeric_code=excluded.numeric_code,
              country_name=excluded.country_name,
              official_name=excluded.official_name,
              region=excluded.region,
              subregion=excluded.subregion,
              default_currency_code=excluded.default_currency_code,
              calling_code=excluded.calling_code,
              postal_code_required=excluded.postal_code_required,
              administrative_level_label=excluded.administrative_level_label,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(countries.map(([country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label])=>({country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_organisation_ledger_family(tenant_id,organisation_id,ledger_family_code,family_name,requires_standard_account_type,schema_json,is_seeded,is_active)
          SELECT $1,$2,ledger_family_code,family_name,requires_standard_account_type,schema_json,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(ledger_family_code text,family_name text,requires_standard_account_type boolean,schema_json jsonb)
          ON CONFLICT(tenant_id,organisation_id,ledger_family_code) DO UPDATE
          SET family_name=excluded.family_name,
              requires_standard_account_type=excluded.requires_standard_account_type,
              schema_json=CASE
                WHEN erp_organisation_ledger_family.schema_json IS NULL OR erp_organisation_ledger_family.schema_json='{}'::jsonb
                THEN excluded.schema_json
                ELSE erp_organisation_ledger_family.schema_json
              END,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(ledgerFamilies.map(([ledger_family_code,family_name,requires_standard_account_type])=>({ledger_family_code,family_name,requires_standard_account_type,schema_json:ledgerFamilySchemas[ledger_family_code]||{}})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active)
          SELECT $1,$2,ledger_family_code,account_type_code,account_type_name,is_required,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(ledger_family_code text,account_type_code text,account_type_name text,is_required boolean)
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(ledgerTypeSeeds.map(([ledger_family_code,account_type_code,account_type_name,is_required])=>({ledger_family_code,account_type_code,account_type_name,is_required})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH root AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL ORDER BY created_at LIMIT 1
          ),
          type_rows AS (
            SELECT account_type_id,account_type_code FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl'
          ),
          payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(account_code text,account_name text,account_type_code text,requires_subledger boolean,required_subledger_family_code text)
          )
          INSERT INTO erp_ledger_account(tenant_id,organisation_id,owner_division_id,ledger_family_code,account_code,account_name,account_type_id,requires_subledger,required_subledger_family_code,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,root.division_id,'gl',p.account_code,p.account_name,t.account_type_id,p.requires_subledger,p.required_subledger_family_code,'approved',$4,$4,$4,now()
          FROM payload p CROSS JOIN root JOIN type_rows t ON t.account_type_code=p.account_type_code
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(chartTemplate.map(([account_code,account_name,account_type_code,requires_subledger,required_subledger_family_code])=>({account_code,account_name,account_type_code,requires_subledger,required_subledger_family_code}))),access.auth.email]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_transaction_group(tenant_id,organisation_id,group_code,group_name,sort_order,is_active)
          SELECT $1,$2,group_code,group_name,sort_order,true
          FROM jsonb_to_recordset($3::jsonb) AS row(group_code text,group_name text,sort_order integer)
          ON CONFLICT(tenant_id,organisation_id,group_code) DO UPDATE
          SET group_name=excluded.group_name,sort_order=excluded.sort_order,is_active=true`,
    values:[access.tenantId,organisationId,JSON.stringify(transactionGroups.map(([group_code,group_name,sort_order])=>({group_code,group_name,sort_order})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,group_code text,type_name text,type_description text,sort_order integer)
          )
          INSERT INTO erp_transaction_type(tenant_id,organisation_id,transaction_group_id,type_code,type_name,type_description,is_financial,allow_additional_lines,sort_order,is_active)
          SELECT $1,$2,g.transaction_group_id,p.type_code,p.type_name,p.type_description,true,true,p.sort_order,true
          FROM payload p JOIN erp_transaction_group g ON g.tenant_id=$1 AND g.organisation_id=$2 AND g.group_code=p.group_code
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET transaction_group_id=excluded.transaction_group_id,type_name=excluded.type_name,type_description=excluded.type_description,is_financial=true,allow_additional_lines=true,sort_order=excluded.sort_order,is_active=true`,
    values:[access.tenantId,organisationId,JSON.stringify(transactionTypes.map(([type_code,group_code,type_name,type_description,sort_order])=>({type_code,group_code,type_name,type_description,sort_order})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,line_order integer,debit_credit text,account_code text,requires_subledger boolean,subledger_family_code text,line_description text)
          ),
          types AS (
            SELECT transaction_type_id,type_code
            FROM erp_transaction_type
            WHERE tenant_id=$1 AND organisation_id=$2
          ),
          accounts AS (
            SELECT ledger_account_id,account_code
            FROM erp_ledger_account
            WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl' AND workflow_status <> 'deleted'
          )
          INSERT INTO erp_posting_rule(tenant_id,organisation_id,transaction_type_id,line_order,debit_credit,default_gl_account_id,requires_subledger,subledger_family_code,amount_source,line_description,is_required)
          SELECT $1,$2,t.transaction_type_id,p.line_order,p.debit_credit,a.ledger_account_id,p.requires_subledger,p.subledger_family_code,'manual',p.line_description,true
          FROM payload p
          JOIN types t ON t.type_code=p.type_code
          JOIN accounts a ON a.account_code=p.account_code
          ON CONFLICT(transaction_type_id,line_order) DO UPDATE
          SET debit_credit=excluded.debit_credit,
              default_gl_account_id=excluded.default_gl_account_id,
              requires_subledger=excluded.requires_subledger,
              subledger_family_code=excluded.subledger_family_code,
              amount_source=excluded.amount_source,
              line_description=excluded.line_description,
              is_required=excluded.is_required`,
    values:[access.tenantId,organisationId,JSON.stringify(postingRuleSeeds.map(([type_code,line_order,debit_credit,account_code,requires_subledger,subledger_family_code,line_description])=>({type_code,line_order,debit_credit,account_code,requires_subledger,subledger_family_code,line_description})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_master_data_type(tenant_id,organisation_id,ledger_family_code,type_code,type_name,schema_json,ui_schema_json,schema_version,workflow_status)
          VALUES($1,$2,'customer','customer','Customer',$3::jsonb,$4::jsonb,1,'approved')
          ON CONFLICT(tenant_id,organisation_id,type_code) DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(customerSchema),JSON.stringify(customerUiSchema)]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
          SELECT $1,$2,role_code,role_name,role_description,is_admin,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(role_code text,role_name text,role_description text,is_admin boolean)
          ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
          SET role_name=excluded.role_name,
              role_description=excluded.role_description,
              is_admin=excluded.is_admin,
              is_active=true`,
    values:[access.tenantId,organisationId,JSON.stringify(roleSeeds.map(([role_code,role_name,role_description,is_admin])=>({role_code,role_name,role_description,is_admin})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH root AS (
            SELECT division_id
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status <> 'deleted'
            ORDER BY created_at
            LIMIT 1
          ),
          payload AS (
            SELECT *
            FROM jsonb_to_recordset($3::jsonb)
            AS row(role_code text,resource_kind text,resource_code text,workflow_status text)
          ),
          expanded AS (
            SELECT p.role_code,p.resource_kind,p.resource_code,p.workflow_status
            FROM payload p
            WHERE p.resource_kind='master_data' OR p.resource_code='*'
            UNION ALL
            SELECT p.role_code,p.resource_kind,tt.transaction_type_id::text,p.workflow_status
            FROM payload p
            JOIN erp_transaction_group tg ON tg.tenant_id=$1 AND tg.organisation_id=$2 AND tg.group_code=p.resource_code
            JOIN erp_transaction_type tt ON tt.transaction_group_id=tg.transaction_group_id
            WHERE p.resource_kind='transaction' AND p.resource_code <> '*'
          )
          INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children)
          SELECT $1,$2,r.role_id,root.division_id,e.resource_kind,e.resource_code,e.workflow_status,
                 CASE WHEN e.workflow_status='view' THEN 'view' ELSE 'manage' END,
                 true
          FROM expanded e
          JOIN erp_role r ON r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_code=e.role_code
          CROSS JOIN root
          WHERE NOT EXISTS (
            SELECT 1
            FROM erp_role_permission existing
            WHERE existing.tenant_id=$1
              AND existing.organisation_id=$2
              AND existing.role_id=r.role_id
              AND existing.division_id=root.division_id
              AND existing.resource_kind=e.resource_kind
              AND existing.resource_code=e.resource_code
              AND existing.workflow_status=e.workflow_status
              AND existing.action_code=CASE WHEN e.workflow_status='view' THEN 'view' ELSE 'manage' END
          )`,
    values:[access.tenantId,organisationId,JSON.stringify(rolePermissionSeeds.map(([role_code,resource_kind,resource_code,workflow_status])=>({role_code,resource_kind,resource_code,workflow_status})))]
  });
  if(isAdministrator(access)){
    await ctx.broker('core_erp','query',{
      text:`WITH existing_admin_user AS (
              SELECT 1
              FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              WHERE ur.tenant_id=$1
                AND ur.organisation_id=$2
                AND role.is_admin=true
                AND role.is_active=true
                AND ur.valid_from <= CURRENT_DATE
                AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              LIMIT 1
            ),
            admin_role AS (
              SELECT role_id
              FROM erp_role
              WHERE tenant_id=$1
                AND organisation_id=$2
                AND role_code='erp_admin'
              LIMIT 1
            )
            INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
            SELECT $1,$2,admin_role.role_id,lower($3),CURRENT_DATE,NULL
            FROM admin_role
            WHERE NOT EXISTS (SELECT 1 FROM existing_admin_user)
            ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
            SET valid_from=LEAST(erp_user_role.valid_from,excluded.valid_from),
                valid_to=NULL`,
      values:[access.tenantId,organisationId,access.auth.email]
    });
  }
}

async function authTenant(ctx){
  const auth=ctx.auth();
  if(!auth)return {status:401,body:{error:'Authentication required'}};
  const tenantId=ctx.cookies.current_tenant;
  if(!tenantId)return {status:400,body:{error:'No current tenant'}};
  const access=await ctx.broker('core_saas','query',{
    brokerProfile:'core_saas',
    text:`SELECT t.tenant_id,tu.tenant_user_type
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE t.tenant_id=$1
          AND lower(tu.email)=lower($2)
          AND t.status='active'
          AND tu.status='active'`,
    values:[tenantId,auth.email]
  });
  if(!access.rowCount)return {status:403,body:{error:'No access to active tenant'}};
  const result={auth,tenantId,role:access.rows[0].tenant_user_type};
  await ensureTenantSeed(ctx,result);
  return result;
}

function isAdministrator(access){
  return ['administrator','administration_user','admin','owner'].includes(String(access.role||'').toLowerCase());
}

function requireAdmin(access){
  if(!isAdministrator(access)){
    return {status:403,body:{error:'Administrator access required'}};
  }
  return null;
}

function clean(value,fallback=''){
  const text=String(value??'').trim();
  return text||fallback;
}

function nullable(value){
  const text=clean(value);
  return text||null;
}

function bool(value){
  return value===true||value==='true'||value===1||value==='1';
}

function money(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.round(n*100)/100:0;
}

function parseJson(value,fallback={}){
  if(value&&typeof value==='object')return value;
  const text=clean(value);
  if(!text)return fallback;
  return JSON.parse(text);
}

function topLevelSearch(schema,data){
  const props=schema?.properties||{};
  const result={};
  Object.keys(props).forEach(key=>{
    const field=props[key]||{};
    if(field['x-searchable']||field['x-reportable']||field['x-listView']){
      const value=data?.[key];
      if(value===undefined||value===null||typeof value==='object')return;
      result[key]=String(value);
    }
  });
  return result;
}

function validateSchema(schema,data){
  const errors=[];
  const props=schema?.properties||{};
  (schema?.required||[]).forEach(key=>{
    if(data?.[key]===undefined||data?.[key]===null||data?.[key]==='')errors.push(`${key} is required`);
  });
  if(schema?.additionalProperties===false){
    Object.keys(data||{}).forEach(key=>{
      if(!props[key])errors.push(`${key} is not allowed by the active schema`);
    });
  }
  Object.entries(props).forEach(([key,field])=>{
    const value=data?.[key];
    if(value===undefined||value===null||value==='')return;
    if(field.type==='array'&&!Array.isArray(value))errors.push(`${key} must be an array`);
    if(field.type==='object'&&(typeof value!=='object'||Array.isArray(value)))errors.push(`${key} must be an object`);
    if(field.type==='string'&&typeof value!=='string')errors.push(`${key} must be a string`);
    if(field.type==='number'&&typeof value!=='number')errors.push(`${key} must be a number`);
    if(field.type==='boolean'&&typeof value!=='boolean')errors.push(`${key} must be true or false`);
    if(Array.isArray(field.enum)&&!field.enum.includes(value))errors.push(`${key} must be one of ${field.enum.join(', ')}`);
  });
  return errors;
}

async function checkPeriodOpen(ctx,tenantId,periodId){
  const r=await ctx.broker('core_erp','query',{text:`SELECT status FROM erp_fiscal_period WHERE tenant_id=$1 AND fiscal_period_id=$2`,values:[tenantId,periodId]});
  if(!r.rowCount)throw Object.assign(new Error('Fiscal period not found'),{status:404});
  if(!['open','soft_closed'].includes(r.rows[0].status))throw Object.assign(new Error('Fiscal period is closed or locked'),{status:400});
}

async function validateJournal(ctx,tenantId,journalId){
  const lines=await ctx.broker('core_erp','query',{
    text:`SELECT l.*,a.requires_subledger,a.required_subledger_family_code,sub.ledger_family_code subledger_family_code
          FROM erp_journal_line l
          JOIN erp_ledger_account a ON a.ledger_account_id=l.gl_account_id
          LEFT JOIN erp_ledger_account sub ON sub.ledger_account_id=l.subledger_account_id
          WHERE l.tenant_id=$1 AND l.journal_id=$2
          ORDER BY l.line_number`,
    values:[tenantId,journalId]
  });
  if(lines.rows.length<2)throw Object.assign(new Error('Journal needs at least two lines'),{status:400});
  let debits=0;
  let credits=0;
  for(const line of lines.rows){
    debits+=Number(line.debit_amount)||0;
    credits+=Number(line.credit_amount)||0;
    if(line.requires_subledger&&!line.subledger_account_id)throw Object.assign(new Error(`Line ${line.line_number} requires a subledger`),{status:400});
    if(line.requires_subledger&&line.required_subledger_family_code&&line.subledger_family_code!==line.required_subledger_family_code){
      throw Object.assign(new Error(`Line ${line.line_number} requires ${line.required_subledger_family_code} subledger`),{status:400});
    }
  }
  if(Math.round(debits*100)!==Math.round(credits*100))throw Object.assign(new Error('Journal debits and credits must balance'),{status:400});
}

module.exports={
  ensureSchema,
  seedGlobal,
  ensureTenantSeed,
  seedOrganisationDefaults,
  authTenant,
  isAdministrator,
  requireAdmin,
  clean,
  nullable,
  bool,
  money,
  parseJson,
  topLevelSearch,
  validateSchema,
  checkPeriodOpen,
  validateJournal,
  glTypes,
  ledgerTypeSeeds,
  workflowStates
};
