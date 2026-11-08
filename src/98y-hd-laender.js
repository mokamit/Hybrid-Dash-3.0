  // =====================================================================================
  // Hybrid-Dash 3.0: A COUNTRY FOR EVERY DRIVER, AND NAMES THAT MATCH IT
  // =====================================================================================
  //
  // BESTELLT: "Have more diverse international names, and also have a feature, where each NPC and player is
  // assigned a country. So the name should culturally match their country."
  //
  // 47 countries, each with its own pool of given names and family names (common names of that country; the famous
  // racing names of each country are left out, so a random pair does not name a real driver). A new NPC first gets a
  // country - drawn so the field stays mixed - and then a name from that country's pool. Players get the country of
  // the browser's region. The country is stored per car (device id) in hybriddash.land.v1, chosen in the garage, and
  // shown as a flag (drawn here as SVG: Windows does not draw flag emoji) on the garage, the grid board, the driver
  // card, the pre-race setup and the main menu. Country names come from the browser (Intl.DisplayNames), in the
  // app language.

  // flag: h = horizontal stripes, v = vertical stripes (a number after a colour is its weight), plus extras.
  const HD_LAENDER = {
    de: { f: 'h:#000|#dd0000|#ffce00', v: ['Lukas', 'Hannah', 'Jonas', 'Lea', 'Felix', 'Marie', 'Tobias', 'Katrin', 'Moritz', 'Anja'], n: ['Becker', 'Hoffmann', 'Krüger', 'Wagner', 'Schäfer', 'Richter', 'Neumann', 'Brandt', 'Hartmann', 'Lorenz', 'Vogel'] },
    at: { f: 'h:#c8102e|#fff|#c8102e', v: ['Florian', 'Lena', 'Matthias', 'Sophie', 'Stefan', 'Julia', 'Andreas', 'Valentina'], n: ['Gruber', 'Huber', 'Bauer', 'Pichler', 'Steiner', 'Moser', 'Hofer', 'Leitner'] },
    ch: { f: 'ch', v: ['Luca', 'Nina', 'Reto', 'Lara', 'Samuel', 'Céline', 'Urs', 'Mia'], n: ['Meier', 'Keller', 'Brunner', 'Baumann', 'Frei', 'Gerber', 'Widmer', 'Zürcher'] },
    nl: { f: 'h:#ae1c28|#fff|#21468b', v: ['Daan', 'Sanne', 'Bram', 'Fleur', 'Joris', 'Lotte', 'Sem', 'Iris'], n: ['de Jong', 'Bakker', 'Visser', 'Smit', 'Mulder', 'de Boer', 'Dekker', 'Hendriks'] },
    be: { f: 'v:#000|#fdda24|#ef3340', v: ['Arne', 'Elise', 'Wout', 'Lien', 'Thibault', 'Margot', 'Senne', 'Noor'], n: ['Peeters', 'Janssens', 'Maes', 'Claes', 'Willems', 'Goossens', 'Dubois', 'Lambert'] },
    fr: { f: 'v:#0055a4|#fff|#ef4135', v: ['Julien', 'Camille', 'Théo', 'Manon', 'Hugo', 'Léa', 'Antoine', 'Chloé', 'Mathis'], n: ['Lefèvre', 'Garnier', 'Rousseau', 'Faure', 'Mercier', 'Blanchard', 'Girard', 'Moreau', 'Duval', 'Fontaine', 'Delacroix'] },
    it: { f: 'v:#009246|#fff|#ce2b37', v: ['Matteo', 'Giulia', 'Lorenzo', 'Chiara', 'Alessandro', 'Francesca', 'Davide', 'Sara'], n: ['Esposito', 'Romano', 'Colombo', 'Ricci', 'Greco', 'Conti', 'De Luca', 'Marchetti', 'Gallo', 'Moretti'] },
    es: { f: 'h:#aa151b|#f1bf00 2|#aa151b', v: ['Pablo', 'Lucía', 'Javier', 'Carmen', 'Sergio', 'Marta', 'Iker', 'Elena'], n: ['García', 'Navarro', 'Morales', 'Ruiz', 'Ortega', 'Delgado', 'Castell', 'Herrera', 'Molina'] },
    pt: { f: 'v:#046a38 2|#da291c 3;c:12,10,3.2,#ffe900', v: ['João', 'Inês', 'Tiago', 'Beatriz', 'Rui', 'Mariana', 'Duarte', 'Leonor'], n: ['Ferreira', 'Costa', 'Pereira', 'Rodrigues', 'Sousa', 'Almeida', 'Carvalho', 'Pinto'] },
    ie: { f: 'v:#169b62|#fff|#ff883e', v: ['Cian', 'Aoife', 'Seán', 'Niamh', 'Oisín', 'Saoirse', 'Darragh', 'Róisín'], n: ['Quinn', 'Murphy', "O'Brien", 'Byrne', 'Doyle', 'Kavanagh', 'Gallagher', 'Nolan'] },
    gb: { f: 'gb', v: ['Oliver', 'Amelia', 'Harry', 'Isla', 'George', 'Freya', 'Callum', 'Poppy', 'Alfie'], n: ['Whitlock', 'Thorne', 'Hughes', 'Bennett', 'Clarke', 'Fletcher', 'Pearce', 'Ashworth', 'Harrington'] },
    se: { f: 'x:#006aa7,#fecc00', v: ['Erik', 'Astrid', 'Oskar', 'Linnea', 'Axel', 'Elin', 'Viktor', 'Saga'], n: ['Lindqvist', 'Nyberg', 'Strand', 'Bergström', 'Sjöberg', 'Holm', 'Ekström', 'Lundgren'] },
    no: { f: 'x:#ba0c2f,#fff,#00205b', v: ['Magnus', 'Ingrid', 'Sindre', 'Kari', 'Eirik', 'Sigrid', 'Henrik', 'Tuva'], n: ['Halvorsen', 'Solberg', 'Haugen', 'Bakken', 'Dahl', 'Moen', 'Lie', 'Nygård'] },
    fi: { f: 'x:#fff,#002f6c', v: ['Aleksi', 'Aino', 'Eetu', 'Venla', 'Joonas', 'Emilia', 'Lauri', 'Sanni'], n: ['Virtanen', 'Korhonen', 'Nieminen', 'Laine', 'Heikkinen', 'Koskinen', 'Lehtonen', 'Järvinen'] },
    dk: { f: 'x:#c8102e,#fff', v: ['Mads', 'Freja', 'Rasmus', 'Ida', 'Frederik', 'Signe', 'Mikkel', 'Emma'], n: ['Lund', 'Nielsen', 'Jensen', 'Kjær', 'Dalsgaard', 'Thomsen', 'Vestergaard', 'Holm'] },
    pl: { f: 'h:#fff|#dc143c', v: ['Jakub', 'Zuzanna', 'Kacper', 'Maja', 'Mateusz', 'Julia', 'Szymon', 'Oliwia'], n: ['Zieliński', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Kowalczyk', 'Mazur', 'Krawczyk'] },
    cz: { f: 'cz', v: ['Jakub', 'Tereza', 'Ondřej', 'Eliška', 'Vojtěch', 'Klára', 'Tomáš', 'Adéla'], n: ['Novák', 'Dvořák', 'Svoboda', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák'] },
    hr: { f: 'hr', v: ['Ivan', 'Lucija', 'Luka', 'Ana', 'Marko', 'Petra', 'Josip', 'Mia'], n: ['Kovač', 'Horvat', 'Babić', 'Marić', 'Jurić', 'Knežević', 'Vuković', 'Novak'] },
    hu: { f: 'h:#ce2939|#fff|#477050', v: ['Bence', 'Réka', 'Máté', 'Dóra', 'Levente', 'Eszter', 'Ádám', 'Zsófia'], n: ['Varga', 'Nagy', 'Tóth', 'Szabó', 'Horváth', 'Kiss', 'Molnár', 'Farkas'] },
    ua: { f: 'h:#0057b7|#ffd700', v: ['Andriy', 'Oksana', 'Taras', 'Yulia', 'Dmytro', 'Kateryna', 'Bohdan', 'Iryna'], n: ['Kovalenko', 'Bondarenko', 'Tkachenko', 'Kravchenko', 'Melnyk', 'Oliynyk', 'Polishchuk', 'Moroz'] },
    bg: { f: 'h:#fff|#00966e|#d62612', v: ['Georgi', 'Elena', 'Dimitar', 'Mira', 'Nikolai', 'Teodora', 'Ivo', 'Raya'], n: ['Petrov', 'Ivanov', 'Georgiev', 'Dimitrov', 'Stoyanov', 'Kolev', 'Todorov', 'Nikolov'] },
    gr: { f: 'gr', v: ['Nikos', 'Eleni', 'Giorgos', 'Sofia', 'Kostas', 'Dimitra', 'Dimitris', 'Katerina'], n: ['Georgiou', 'Nikolaidis', 'Pappas', 'Dimitriou', 'Karalis', 'Vlachos', 'Makris', 'Antoniou'] },
    tr: { f: 'tr', v: ['Emre', 'Elif', 'Burak', 'Zeynep', 'Kerem', 'Defne', 'Mert', 'Ayşe'], n: ['Kaplan', 'Yılmaz', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan'] },
    ir: { f: 'h:#239f40|#fff|#da0000;c:15,10,2.2,#da0000', v: ['Arash', 'Shirin', 'Dariush', 'Leila', 'Kian', 'Parisa', 'Babak', 'Yasmin'], n: ['Rahimi', 'Karimi', 'Hosseini', 'Moradi', 'Tehrani', 'Jafari', 'Sadeghi', 'Azizi'] },
    ae: { f: 'ae', v: ['Rashid', 'Mariam', 'Khalid', 'Fatima', 'Saeed', 'Aisha', 'Hamdan', 'Noura'], n: ['Al Mansoori', 'Al Hashimi', 'Al Ketbi', 'Al Nuaimi', 'Al Shamsi', 'Al Suwaidi', 'Al Dhaheri'] },
    eg: { f: 'h:#ce1126|#fff|#000;c:15,10,2,#c09300', v: ['Omar', 'Nour', 'Karim', 'Salma', 'Youssef', 'Mariam', 'Ahmed', 'Laila'], n: ['Hassan', 'Mansour', 'Farouk', 'Saleh', 'Ibrahim', 'Nasser', 'Fathy', 'Kamal'] },
    ma: { f: 'h:#c1272d;s:15,10,5,#006233', v: ['Yassine', 'Salma', 'Amine', 'Imane', 'Hamza', 'Khadija', 'Mehdi', 'Sara'], n: ['Benali', 'El Idrissi', 'Alaoui', 'Bennani', 'Tazi', 'Berrada', 'Chraibi', 'Fassi'] },
    ng: { f: 'v:#008751|#fff|#008751', v: ['Chinedu', 'Adaeze', 'Emeka', 'Ngozi', 'Tunde', 'Folake', 'Ifeanyi', 'Amara'], n: ['Okafor', 'Adeyemi', 'Achebe', 'Okonkwo', 'Balogun', 'Eze', 'Nwosu', 'Adebayo'] },
    gh: { f: 'h:#ce1126|#fcd116|#006b3f;s:15,10,3.4,#000', v: ['Kofi', 'Ama', 'Kwame', 'Akosua', 'Yaw', 'Efua', 'Kojo', 'Abena'], n: ['Mensah', 'Osei', 'Boateng', 'Asante', 'Owusu', 'Agyeman', 'Ofori', 'Darko'] },
    ke: { f: 'h:#000 3|#fff|#bb0000 3|#fff|#006600 3;e:15,10,2.4,5,#bb0000', v: ['Brian', 'Wanjiku', 'Kevin', 'Achieng', 'Daniel', 'Njeri', 'Collins', 'Akinyi'], n: ['Kamau', 'Otieno', 'Mwangi', 'Odhiambo', 'Wafula', 'Njoroge', 'Kiprono', 'Chege'] },
    za: { f: 'za', v: ['Thabo', 'Lerato', 'Sipho', 'Naledi', 'Pieter', 'Anika', 'Lwazi', 'Zanele'], n: ['Nkosi', 'Dlamini', 'Botha', 'Khumalo', 'Naidoo', 'Mokoena', 'Pretorius', 'Ndlovu'] },
    in: { f: 'h:#ff9933|#fff|#138808;r:15,10,2.6,#000080', v: ['Arjun', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Kavya', 'Aditya', 'Meera'], n: ['Sharma', 'Iyer', 'Patel', 'Reddy', 'Nair', 'Menon', 'Kapoor', 'Rao'] },
    th: { f: 'h:#a51931|#f4f5f8|#2d2a4a 2|#f4f5f8|#a51931', v: ['Krit', 'Ploy', 'Nattapong', 'Siriporn', 'Anan', 'Malee', 'Somchai', 'Kanya'], n: ['Srisuk', 'Wongsawat', 'Boonmee', 'Thongdee', 'Phromma', 'Chaiyaporn', 'Sukprasert'] },
    vn: { f: 'h:#da251d;s:15,10,5.5,#ffff00', v: ['Minh', 'Linh', 'Huy', 'Trang', 'Duc', 'Mai', 'Khoa', 'Thao'], n: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Dang'] },
    id: { f: 'h:#ff0000|#fff', v: ['Budi', 'Putri', 'Rizky', 'Dewi', 'Arif', 'Sari', 'Bayu', 'Ayu'], n: ['Santoso', 'Wijaya', 'Saputra', 'Hidayat', 'Pratama', 'Kusuma', 'Siregar', 'Nugroho'] },
    ph: { f: 'ph', v: ['Miguel', 'Andrea', 'Paolo', 'Bea', 'Carlo', 'Trisha', 'Jericho', 'Kim'], n: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Dela Cruz', 'Villanueva', 'Mendoza', 'Aquino'] },
    jp: { f: 'h:#fff;c:15,10,6,#bc002d', v: ['Haruto', 'Yui', 'Ren', 'Sakura', 'Sota', 'Aoi', 'Daiki', 'Hina', 'Kenji'], n: ['Tanaka', 'Ishikawa', 'Watanabe', 'Yamamoto', 'Nakamura', 'Fujiwara', 'Morita', 'Shimizu', 'Kondo'] },
    kr: { f: 'kr', v: ['Min-jun', 'Seo-yeon', 'Ji-ho', 'Ha-eun', 'Do-yun', 'Ji-woo', 'Hyun-woo', 'Su-bin'], n: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Han'] },
    cn: { f: 'h:#de2910;s:6,6,3.6,#ffde00;s:11,3,1,#ffde00;s:13,5,1,#ffde00;s:13,8,1,#ffde00;s:11,10,1,#ffde00', v: ['Wei', 'Lina', 'Hao', 'Mei', 'Jun', 'Xin', 'Yu', 'Lan'], n: ['Wang', 'Li', 'Chen', 'Liu', 'Zhang', 'Yang', 'Huang', 'Lin'] },
    au: { f: 'au:#ffffff', v: ['Jack', 'Chloe', 'Riley', 'Matilda', 'Cooper', 'Ruby', 'Lachlan', 'Sienna'], n: ['Mitchell', 'Hayes', 'Doherty', 'Cartwright', 'Fraser', 'Bowman', 'Sutherland', 'Kelly'] },
    nz: { f: 'au:#cc142b', v: ['Ethan', 'Aroha', 'Liam', 'Mere', 'Nikau', 'Isla', 'Tama', 'Ava'], n: ['Ngata', 'Parata', 'Wilson', 'Campbell', 'Morrison', 'Te Rangi', 'Walker', 'Paewai'] },
    us: { f: 'us', v: ['Tyler', 'Madison', 'Austin', 'Kayla', 'Cody', 'Brooke', 'Hunter', 'Savannah', 'Mason'], n: ['Calloway', 'Whitaker', 'Brooks', 'Sullivan', 'Carter', 'Dawson', 'Holloway', 'Prescott', 'Mercer'] },
    ca: { f: 'v:#d52b1e|#fff 2|#d52b1e;m:#d52b1e', v: ['Liam', 'Chloé', 'Tristan', 'Maëlle', 'Owen', 'Brooke', 'Mathieu', 'Avery'], n: ['Tremblay', 'Gagnon', 'Lavoie', 'MacKenzie', 'Bouchard', 'Fraser', 'Côté', 'Leblanc'] },
    mx: { f: 'v:#006847|#fff|#ce1126;c:15,10,2.2,#8c6b3c', v: ['Santiago', 'Ximena', 'Emiliano', 'Valeria', 'Diego', 'Regina', 'Iker', 'Fernanda'], n: ['Reyes', 'Sandoval', 'Hernández', 'Guerrero', 'Mendoza', 'Castañeda', 'Vargas', 'Ibarra'] },
    co: { f: 'h:#fcd116 2|#003893|#ce1126', v: ['Andrés', 'Valentina', 'Sebastián', 'Daniela', 'Camilo', 'Mariana', 'Esteban', 'Laura'], n: ['Restrepo', 'Gómez', 'Cárdenas', 'Ospina', 'Zapata', 'Montes', 'Arango', 'Londoño'] },
    br: { f: 'br', v: ['Gabriel', 'Larissa', 'Thiago', 'Beatriz', 'Rafael', 'Camila', 'Lucas', 'Fernanda'], n: ['Castro', 'Oliveira', 'Souza', 'Almeida', 'Ribeiro', 'Barbosa', 'Teixeira', 'Moura'] },
    ar: { f: 'h:#74acdf|#fff|#74acdf;c:15,10,2.2,#f6b40e', v: ['Facundo', 'Lucía', 'Tomás', 'Martina', 'Joaquín', 'Agustina', 'Nicolás', 'Micaela'], n: ['Fernández', 'Gutiérrez', 'Acosta', 'Romero', 'Medina', 'Benítez', 'Sosa', 'Giménez'] },
    cl: { f: 'cl', v: ['Benjamín', 'Josefa', 'Vicente', 'Antonia', 'Matías', 'Catalina', 'Cristóbal', 'Florencia'], n: ['Muñoz', 'Rojas', 'Soto', 'Contreras', 'Figueroa', 'Espinoza', 'Valenzuela', 'Silva'] },
  };
  const HD_LAND_CODES = Object.keys(HD_LAENDER);
  // The old name pool (v2.0): its surnames point to a country, so the NPCs named before keep a fitting flag.
  const HD_ALT_NACHNAME_LAND = { Kovac: 'hr', Lindqvist: 'se', Moreau: 'fr', Okafor: 'ng', Tanaka: 'jp', Brandt: 'de', Castell: 'es', Novak: 'cz',
    Reyes: 'mx', Halvorsen: 'no', Duval: 'fr', Mensah: 'gh', Petrov: 'bg', Sandoval: 'mx', Whitlock: 'gb', Ferreira: 'pt', Kaplan: 'tr',
    Ishikawa: 'jp', Varga: 'hu', Delacroix: 'fr', Osei: 'gh', Marchetti: 'it', Nyberg: 'se', Quinn: 'ie', Rahimi: 'ir', Solberg: 'no',
    Thorne: 'gb', Adeyemi: 'ng', Calloway: 'us', Bianchi: 'it', Strand: 'se', Morales: 'es', Hartmann: 'de', Zielinski: 'pl', Achebe: 'ng',
    Lund: 'dk', Navarro: 'es', Castro: 'br', Fontaine: 'fr', Mbeki: 'za' };

  // ---- flags as SVG (30 x 20) ------------------------------------------------------------------------------------------
  function hdLandStern(cx, cy, r, farbe) {
    let p = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
      p += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
    }
    return '<path d="' + p + 'Z" fill="' + farbe + '"/>';
  }
  function hdLandStreifen(spec, horiz) {
    const teile = spec.split('|').map((x) => { const [c, w] = x.trim().split(' '); return { c, w: +w || 1 }; });
    const summe = teile.reduce((s, x) => s + x.w, 0);
    let pos = 0, out = '';
    for (const x of teile) {
      const d = (horiz ? 20 : 30) * x.w / summe;
      out += horiz ? '<rect x="0" y="' + pos.toFixed(2) + '" width="30" height="' + (d + 0.05).toFixed(2) + '" fill="' + x.c + '"/>'
        : '<rect x="' + pos.toFixed(2) + '" y="0" width="' + (d + 0.05).toFixed(2) + '" height="20" fill="' + x.c + '"/>';
      pos += d;
    }
    return out;
  }
  function hdUnion(w, h) {   // union flag in a w x h box at 0,0
    return '<rect width="' + w + '" height="' + h + '" fill="#012169"/>'
      + '<path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="#fff" stroke-width="' + (h / 5) + '"/>'
      + '<path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="#c8102e" stroke-width="' + (h / 15) + '"/>'
      + '<path d="M' + (w / 2) + ' 0V' + h + 'M0 ' + (h / 2) + 'H' + w + '" stroke="#fff" stroke-width="' + (h / 3) + '"/>'
      + '<path d="M' + (w / 2) + ' 0V' + h + 'M0 ' + (h / 2) + 'H' + w + '" stroke="#c8102e" stroke-width="' + (h / 5) + '"/>';
  }
  function hdLandFlaggeInnen(code) {
    const L = HD_LAENDER[code];
    if (!L) return '<rect width="30" height="20" fill="#555"/>';
    const spezial = {
      gb: () => hdUnion(30, 20),
      ch: () => '<rect width="30" height="20" fill="#da291c"/><path d="M13 4h4v4h4v4h-4v4h-4v-4H9V8h4z" fill="#fff"/>',
      cz: () => hdLandStreifen('#fff|#d7141a', true) + '<path d="M0 0L15 10L0 20Z" fill="#11457e"/>',
      gr: () => hdLandStreifen('#0d5eaf|#fff|#0d5eaf|#fff|#0d5eaf|#fff|#0d5eaf|#fff|#0d5eaf', true)
        + '<rect width="11.1" height="11.1" fill="#0d5eaf"/><path d="M5.55 0V11.1M0 5.55H11.1" stroke="#fff" stroke-width="2.2"/>',
      tr: () => '<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.3" cy="10" r="4" fill="#e30a17"/>' + hdLandStern(17.2, 10, 2.4, '#fff'),
      ae: () => hdLandStreifen('#00732f|#fff|#000', true) + '<rect width="8" height="20" fill="#ff0000"/>',
      za: () => '<rect width="30" height="10" fill="#e03c31"/><rect y="10" width="30" height="10" fill="#001489"/>'
        + '<path d="M0 0L13 10L0 20M13 10H30" stroke="#fff" stroke-width="6.6" fill="none"/><path d="M0 0L13 10L0 20M13 10H30" stroke="#007749" stroke-width="4" fill="none"/>'
        + '<path d="M0 3.2L8.8 10L0 16.8Z" fill="#ffb81c"/><path d="M0 5L6.4 10L0 15Z" fill="#000"/>',
      hr: () => hdLandStreifen('#ff0000|#fff|#171796', true) + '<path d="M12 5.4h6v6.2a3 3 0 0 1-6 0z" fill="#fff" stroke="#171796" stroke-width=".4"/>'
        + [0, 1, 2, 3].map((r) => [0, 1, 2, 3].filter((c) => (r + c) % 2 === 0).map((c) => '<rect x="' + (12 + c * 1.5) + '" y="' + (5.4 + r * 1.5) + '" width="1.5" height="1.5" fill="#ff0000"/>').join('')).join(''),
      ph: () => hdLandStreifen('#0038a8|#ce1126', true) + '<path d="M0 0L17 10L0 20Z" fill="#fff"/><circle cx="5.5" cy="10" r="2.2" fill="#fcd116"/>',
      kr: () => '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#003478"/><path d="M10 10a5 5 0 0 1 10 0a2.5 2.5 0 0 1-5 0a2.5 2.5 0 0 0-5 0z" fill="#cd2e3a"/>'
        + '<path d="M5 4.5l3 2M22 13.5l3 2M5 15.5l3-2M22 6.5l3-2" stroke="#000" stroke-width="1.6"/>',
      us: () => hdLandStreifen(Array.from({ length: 13 }, (_, i) => (i % 2 ? '#fff' : '#b22234')).join('|'), true) + '<rect width="12" height="10.8" fill="#3c3b6e"/>'
        + [2, 5, 8].map((y) => [2, 4.6, 7.2, 9.8].map((x) => '<circle cx="' + x + '" cy="' + (y + 0.4) + '" r=".55" fill="#fff"/>').join('')).join(''),
      br: () => '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.4L27.4 10L15 17.6L2.6 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.4" fill="#002776"/>'
        + '<path d="M10.8 9.2q4.2-1.2 8.4 1.4" stroke="#fff" stroke-width=".8" fill="none"/>',
      cl: () => '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#d52b1e"/><rect width="10" height="10" fill="#0039a6"/>' + hdLandStern(5, 5, 2.6, '#fff'),
    };
    if (spezial[L.f]) return spezial[L.f]();
    let out = '';
    for (const teil of L.f.split(';')) {
      const [art, rest] = [teil.slice(0, teil.indexOf(':')), teil.slice(teil.indexOf(':') + 1)];
      if (art === 'h' || art === 'v') out += hdLandStreifen(rest, art === 'h');
      else if (art === 'x') {   // Nordic cross: background, cross, optional inner cross
        const [bg, kreuz, innen] = rest.split(',');
        out += '<rect width="30" height="20" fill="' + bg + '"/><path d="M11 0V20M0 10H30" stroke="' + kreuz + '" stroke-width="' + (innen ? 5 : 4) + '"/>'
          + (innen ? '<path d="M11 0V20M0 10H30" stroke="' + innen + '" stroke-width="2.4"/>' : '');
      } else if (art === 'c') { const [x, y, r, f] = rest.split(','); out += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"/>'; }
      else if (art === 'r') { const [x, y, r, f] = rest.split(','); out += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + f + '" stroke-width=".9"/>'; }
      else if (art === 'e') { const [x, y, rx, ry, f] = rest.split(','); out += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"/>'; }
      else if (art === 's') { const [x, y, r, f] = rest.split(','); out += hdLandStern(+x, +y, +r, f); }
      else if (art === 'm') out += '<path d="M15 4.6l1 2 1.4-.6-.4 3 1.6-1.4.6 1.2 1.6-.4-.6 1.8.8.4-2.6 2-.2 1H15.4v2.2h-.8V13.8h-1.4l-.2-1-2.6-2 .8-.4-.6-1.8 1.6.4.6-1.2L14.4 9.4l-.4-3 1.4.6z" fill="' + rest + '"/>';
      else if (art === 'au') out += '<rect width="30" height="20" fill="#012169"/>' + hdUnion(15, 10)
        + [[22.5, 4.2], [26, 8.4], [19.5, 9.6], [22.5, 16]].map(([x, y]) => hdLandStern(x, y, 1.3, rest)).join('') + hdLandStern(7.5, 15, 2, '#fff');
    }
    return out;
  }
  let hdLandFlaggeNr = 0;
  function hdLandFlagge(code, hoehe) {
    const h = hoehe || 14, w = Math.round(h * 1.5), id = 'hdfl' + (++hdLandFlaggeNr);
    return '<svg class="hd-flagge" width="' + w + '" height="' + h + '" viewBox="0 0 30 20" role="img" aria-label="' + hdLandName(code).replace(/"/g, '') + '">'
      + '<defs><clipPath id="' + id + '"><rect width="30" height="20" rx="2"/></clipPath></defs><g clip-path="url(#' + id + ')">' + hdLandFlaggeInnen(code) + '</g>'
      + '<rect x=".4" y=".4" width="29.2" height="19.2" rx="2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".8"/></svg>';
  }
  function hdLandName(code) {
    try {
      const sprache = typeof lang === 'string' ? lang : 'en';
      return new Intl.DisplayNames([sprache], { type: 'region' }).of(String(code).toUpperCase()) || String(code).toUpperCase();
    } catch (e) { return String(code).toUpperCase(); }
  }

  // ---- the country of a car ------------------------------------------------------------------------------------------
  const HD_LAND_STORE = 'hybriddash.land.v1';
  let hdLandDaten = null;
  function hdLandAlle() {
    if (!hdLandDaten) { try { hdLandDaten = JSON.parse(localStorage.getItem(HD_LAND_STORE) || '{}') || {}; } catch (e) { hdLandDaten = {}; } }
    return hdLandDaten;
  }
  function hdLandSchreiben() { try { localStorage.setItem(HD_LAND_STORE, JSON.stringify(hdLandAlle())); } catch (e) { /* private */ } }
  function hdLandBrowser() {
    try {
      const sprachen = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
      for (const s of sprachen) { const m = /[-_]([a-z]{2})$/i.exec(s || ''); if (m && HD_LAENDER[m[1].toLowerCase()]) return m[1].toLowerCase(); }
      const l = String(sprachen[0] || '').slice(0, 2).toLowerCase();
      return ({ de: 'de', fr: 'fr', it: 'it', es: 'es', pt: 'pt', nl: 'nl', sv: 'se', nb: 'no', fi: 'fi', da: 'dk', pl: 'pl', cs: 'cz', hu: 'hu', tr: 'tr', ja: 'jp', ko: 'kr', zh: 'cn' })[l] || 'gb';
    } catch (e) { return 'gb'; }
  }
  // The country from a name: a family name in one of the pools (old names included).
  function hdLandAusName(name) {
    const w = String(name || '').trim();
    if (!w) return null;
    const nach = w.split(/\s+/).slice(1).join(' ');
    if (HD_ALT_NACHNAME_LAND[w.split(/\s+/).pop()]) return HD_ALT_NACHNAME_LAND[w.split(/\s+/).pop()];
    for (const c of HD_LAND_CODES) if (nach && HD_LAENDER[c].n.includes(nach)) return c;
    return null;
  }
  function hdLand(car) {
    if (!car || !car.device) return null;
    const id = String(car.device.id), alle = hdLandAlle();
    if (alle[id] && HD_LAENDER[alle[id]]) return alle[id];
    // First time: from the name if it is one of ours, players from the browser, otherwise a drawn country.
    const code = hdLandAusName(car.alias) || (/^player/.test(car.role || '') ? hdLandBrowser() : hdLandZiehen(car));
    alle[id] = code; hdLandSchreiben();
    return code;
  }
  function hdLandSetzen(car, code) {
    if (!car || !car.device || !HD_LAENDER[code]) return;
    hdLandAlle()[String(car.device.id)] = code; hdLandSchreiben();
  }
  // A country for a new NPC: one nobody in the garage has yet, if possible - so the field is international.
  function hdLandZiehen(car) {
    let belegt = new Set();
    try { garage.forEach((c) => { if (c !== car && c.device) { const x = hdLandAlle()[String(c.device.id)]; if (x) belegt.add(x); } }); } catch (e) { /* no garage */ }
    const frei = HD_LAND_CODES.filter((c) => !belegt.has(c));
    const pool = frei.length ? frei : HD_LAND_CODES;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // A name from the car's country (new country for an NPC without one).
  function hdNameFuerAuto(car, belegt) {
    const code = (car && car.device && hdLandAlle()[String(car.device.id)]) || (car && car.device ? hdLand(car) : hdLandZiehen(car));
    const L = HD_LAENDER[code];
    for (let i = 0; i < 200; i++) {
      const n = L.v[Math.floor(Math.random() * L.v.length)] + ' ' + L.n[Math.floor(Math.random() * L.n.length)];
      if (n.length <= 18 && !(belegt && belegt.has(n.toLowerCase()))) return n;
    }
    return hdZufallsName(belegt || new Set());
  }
  // HTML bits for the other screens.
  function hdLandFlaggeFuer(car, hoehe) { const c = hdLand(car); return c ? hdLandFlagge(c, hoehe) : ''; }

  // ---- the garage row: Country (a select, so the controller can step through it with left / right) ------------------
  function hdLandZeile(car, nach) {
    if (!car || !car.device || !nach || !nach.parentNode) return;
    const code = hdLand(car);
    const z = document.createElement('div');
    z.className = 'opt-row gk-zeile gar-a-land';
    const namen = HD_LAND_CODES.map((c) => [c, hdLandName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
    z.innerHTML = '<span class="gk-l">' + t('Land') + '</span><span class="gar-land-flagge" data-i18n-skip>' + hdLandFlagge(code, 18) + '</span>'
      + '<select class="gar-land-wahl" data-i18n-skip aria-label="' + t('Land') + '">'
      + namen.map(([c, n]) => '<option value="' + c + '"' + (c === code ? ' selected' : '') + '>' + n.replace(/</g, '') + '</option>').join('') + '</select>';
    const sel = z.querySelector('select');
    sel.addEventListener('change', () => {
      hdLandSetzen(car, sel.value);
      z.querySelector('.gar-land-flagge').innerHTML = hdLandFlagge(sel.value, 18);
      // An NPC takes a name of its new country; a player keeps the name they chose.
      if (car.role === 'ghost' && typeof hdNeuerName === 'function') { hdNeuerName(car); return; }
      try { renderGarage(); if (typeof renderRaceGrid === 'function') renderRaceGrid(); } catch (e) { /* not ready */ }
    });
    nach.parentNode.insertBefore(z, nach.nextSibling);
  }
  window.HYBRIDDASH_LAENDER = Object.freeze({ codes: HD_LAND_CODES, land: hdLand, setzen: hdLandSetzen, name: hdLandName, flagge: hdLandFlagge,
    _nameFuer: (code) => { const L = HD_LAENDER[code]; return L.v[0] + ' ' + L.n[0]; }, _neuerName: (car) => hdNameFuerAuto(car) });
