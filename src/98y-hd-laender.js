  // =====================================================================================
  // Hybrid-Dash 3.0: A COUNTRY FOR EVERY DRIVER, AND NAMES THAT MATCH IT
  // =====================================================================================
  //
  // BESTELLT: "Have more diverse international names, and also have a feature, where each NPC and player is
  // assigned a country. So the name should culturally match their country."
  //
  // Every country and territory (243, with England, Scotland, Wales and Northern Ireland). 47 have their own pool of
  // given and family names; every other one takes the pool of its language / region (HD_NAMEN_POOLS). Famous racing
  // names are left out, so a random pair does not name a real driver. A new NPC first gets a
  // country - drawn so the field stays mixed - and then a name from that country's pool. Players get the country of
  // the browser's region. The country is stored per car (device id) in hybriddash.land.v1, chosen in the garage, and
  // shown as a flag (the SVG files of flag-icons in img/flaggen - Windows does not draw flag emoji) on the garage, the grid board, the driver
  // card, the pre-race setup and the main menu. Country names come from the browser (Intl.DisplayNames), in the
  // app language.

  const HD_LAENDER = {
    de: { v: ['Lukas', 'Hannah', 'Jonas', 'Lea', 'Felix', 'Marie', 'Tobias', 'Katrin', 'Moritz', 'Anja'], n: ['Becker', 'Hoffmann', 'Krüger', 'Wagner', 'Schäfer', 'Richter', 'Neumann', 'Brandt', 'Hartmann', 'Lorenz', 'Vogel'] },
    at: { v: ['Florian', 'Lena', 'Matthias', 'Sophie', 'Stefan', 'Julia', 'Andreas', 'Valentina'], n: ['Gruber', 'Huber', 'Bauer', 'Pichler', 'Steiner', 'Moser', 'Hofer', 'Leitner'] },
    ch: { v: ['Luca', 'Nina', 'Reto', 'Lara', 'Samuel', 'Céline', 'Urs', 'Mia'], n: ['Meier', 'Keller', 'Brunner', 'Baumann', 'Frei', 'Gerber', 'Widmer', 'Zürcher'] },
    nl: { v: ['Daan', 'Sanne', 'Bram', 'Fleur', 'Joris', 'Lotte', 'Sem', 'Iris'], n: ['de Jong', 'Bakker', 'Visser', 'Smit', 'Mulder', 'de Boer', 'Dekker', 'Hendriks'] },
    be: { v: ['Arne', 'Elise', 'Wout', 'Lien', 'Thibault', 'Margot', 'Senne', 'Noor'], n: ['Peeters', 'Janssens', 'Maes', 'Claes', 'Willems', 'Goossens', 'Dubois', 'Lambert'] },
    fr: { v: ['Julien', 'Camille', 'Théo', 'Manon', 'Hugo', 'Léa', 'Antoine', 'Chloé', 'Mathis'], n: ['Lefèvre', 'Garnier', 'Rousseau', 'Faure', 'Mercier', 'Blanchard', 'Girard', 'Moreau', 'Duval', 'Fontaine', 'Delacroix'] },
    it: { v: ['Matteo', 'Giulia', 'Lorenzo', 'Chiara', 'Alessandro', 'Francesca', 'Davide', 'Sara'], n: ['Esposito', 'Romano', 'Colombo', 'Ricci', 'Greco', 'Conti', 'De Luca', 'Marchetti', 'Gallo', 'Moretti'] },
    es: { v: ['Pablo', 'Lucía', 'Javier', 'Carmen', 'Sergio', 'Marta', 'Iker', 'Elena'], n: ['García', 'Navarro', 'Morales', 'Ruiz', 'Ortega', 'Delgado', 'Castell', 'Herrera', 'Molina'] },
    pt: { v: ['João', 'Inês', 'Tiago', 'Beatriz', 'Rui', 'Mariana', 'Duarte', 'Leonor'], n: ['Ferreira', 'Costa', 'Pereira', 'Rodrigues', 'Sousa', 'Almeida', 'Carvalho', 'Pinto'] },
    ie: { v: ['Cian', 'Aoife', 'Seán', 'Niamh', 'Oisín', 'Saoirse', 'Darragh', 'Róisín'], n: ['Quinn', 'Murphy', "O'Brien", 'Byrne', 'Doyle', 'Kavanagh', 'Gallagher', 'Nolan'] },
    gb: { v: ['Oliver', 'Amelia', 'Harry', 'Isla', 'George', 'Freya', 'Callum', 'Poppy', 'Alfie'], n: ['Whitlock', 'Thorne', 'Hughes', 'Bennett', 'Clarke', 'Fletcher', 'Pearce', 'Ashworth', 'Harrington'] },
    se: { v: ['Erik', 'Astrid', 'Oskar', 'Linnea', 'Axel', 'Elin', 'Viktor', 'Saga'], n: ['Lindqvist', 'Nyberg', 'Strand', 'Bergström', 'Sjöberg', 'Holm', 'Ekström', 'Lundgren'] },
    no: { v: ['Magnus', 'Ingrid', 'Sindre', 'Kari', 'Eirik', 'Sigrid', 'Henrik', 'Tuva'], n: ['Halvorsen', 'Solberg', 'Haugen', 'Bakken', 'Dahl', 'Moen', 'Lie', 'Nygård'] },
    fi: { v: ['Aleksi', 'Aino', 'Eetu', 'Venla', 'Joonas', 'Emilia', 'Lauri', 'Sanni'], n: ['Virtanen', 'Korhonen', 'Nieminen', 'Laine', 'Heikkinen', 'Koskinen', 'Lehtonen', 'Järvinen'] },
    dk: { v: ['Mads', 'Freja', 'Rasmus', 'Ida', 'Frederik', 'Signe', 'Mikkel', 'Emma'], n: ['Lund', 'Nielsen', 'Jensen', 'Kjær', 'Dalsgaard', 'Thomsen', 'Vestergaard', 'Holm'] },
    pl: { v: ['Jakub', 'Zuzanna', 'Kacper', 'Maja', 'Mateusz', 'Julia', 'Szymon', 'Oliwia'], n: ['Zieliński', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Kowalczyk', 'Mazur', 'Krawczyk'] },
    cz: { v: ['Jakub', 'Tereza', 'Ondřej', 'Eliška', 'Vojtěch', 'Klára', 'Tomáš', 'Adéla'], n: ['Novák', 'Dvořák', 'Svoboda', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák'] },
    hr: { v: ['Ivan', 'Lucija', 'Luka', 'Ana', 'Marko', 'Petra', 'Josip', 'Mia'], n: ['Kovač', 'Horvat', 'Babić', 'Marić', 'Jurić', 'Knežević', 'Vuković', 'Novak'] },
    hu: { v: ['Bence', 'Réka', 'Máté', 'Dóra', 'Levente', 'Eszter', 'Ádám', 'Zsófia'], n: ['Varga', 'Nagy', 'Tóth', 'Szabó', 'Horváth', 'Kiss', 'Molnár', 'Farkas'] },
    ua: { v: ['Andriy', 'Oksana', 'Taras', 'Yulia', 'Dmytro', 'Kateryna', 'Bohdan', 'Iryna'], n: ['Kovalenko', 'Bondarenko', 'Tkachenko', 'Kravchenko', 'Melnyk', 'Oliynyk', 'Polishchuk', 'Moroz'] },
    bg: { v: ['Georgi', 'Elena', 'Dimitar', 'Mira', 'Nikolai', 'Teodora', 'Ivo', 'Raya'], n: ['Petrov', 'Ivanov', 'Georgiev', 'Dimitrov', 'Stoyanov', 'Kolev', 'Todorov', 'Nikolov'] },
    gr: { v: ['Nikos', 'Eleni', 'Giorgos', 'Sofia', 'Kostas', 'Dimitra', 'Dimitris', 'Katerina'], n: ['Georgiou', 'Nikolaidis', 'Pappas', 'Dimitriou', 'Karalis', 'Vlachos', 'Makris', 'Antoniou'] },
    tr: { v: ['Emre', 'Elif', 'Burak', 'Zeynep', 'Kerem', 'Defne', 'Mert', 'Ayşe'], n: ['Kaplan', 'Yılmaz', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan'] },
    ir: { v: ['Arash', 'Shirin', 'Dariush', 'Leila', 'Kian', 'Parisa', 'Babak', 'Yasmin'], n: ['Rahimi', 'Karimi', 'Hosseini', 'Moradi', 'Tehrani', 'Jafari', 'Sadeghi', 'Azizi'] },
    ae: { v: ['Rashid', 'Mariam', 'Khalid', 'Fatima', 'Saeed', 'Aisha', 'Hamdan', 'Noura'], n: ['Al Mansoori', 'Al Hashimi', 'Al Ketbi', 'Al Nuaimi', 'Al Shamsi', 'Al Suwaidi', 'Al Dhaheri'] },
    eg: { v: ['Omar', 'Nour', 'Karim', 'Salma', 'Youssef', 'Mariam', 'Ahmed', 'Laila'], n: ['Hassan', 'Mansour', 'Farouk', 'Saleh', 'Ibrahim', 'Nasser', 'Fathy', 'Kamal'] },
    ma: { v: ['Yassine', 'Salma', 'Amine', 'Imane', 'Hamza', 'Khadija', 'Mehdi', 'Sara'], n: ['Benali', 'El Idrissi', 'Alaoui', 'Bennani', 'Tazi', 'Berrada', 'Chraibi', 'Fassi'] },
    ng: { v: ['Chinedu', 'Adaeze', 'Emeka', 'Ngozi', 'Tunde', 'Folake', 'Ifeanyi', 'Amara'], n: ['Okafor', 'Adeyemi', 'Achebe', 'Okonkwo', 'Balogun', 'Eze', 'Nwosu', 'Adebayo'] },
    gh: { v: ['Kofi', 'Ama', 'Kwame', 'Akosua', 'Yaw', 'Efua', 'Kojo', 'Abena'], n: ['Mensah', 'Osei', 'Boateng', 'Asante', 'Owusu', 'Agyeman', 'Ofori', 'Darko'] },
    ke: { v: ['Brian', 'Wanjiku', 'Kevin', 'Achieng', 'Daniel', 'Njeri', 'Collins', 'Akinyi'], n: ['Kamau', 'Otieno', 'Mwangi', 'Odhiambo', 'Wafula', 'Njoroge', 'Kiprono', 'Chege'] },
    za: { v: ['Thabo', 'Lerato', 'Sipho', 'Naledi', 'Pieter', 'Anika', 'Lwazi', 'Zanele'], n: ['Nkosi', 'Dlamini', 'Botha', 'Khumalo', 'Naidoo', 'Mokoena', 'Pretorius', 'Ndlovu'] },
    in: { v: ['Arjun', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Kavya', 'Aditya', 'Meera'], n: ['Sharma', 'Iyer', 'Patel', 'Reddy', 'Nair', 'Menon', 'Kapoor', 'Rao'] },
    th: { v: ['Krit', 'Ploy', 'Nattapong', 'Siriporn', 'Anan', 'Malee', 'Somchai', 'Kanya'], n: ['Srisuk', 'Wongsawat', 'Boonmee', 'Thongdee', 'Phromma', 'Chaiyaporn', 'Sukprasert'] },
    vn: { v: ['Minh', 'Linh', 'Huy', 'Trang', 'Duc', 'Mai', 'Khoa', 'Thao'], n: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Dang'] },
    id: { v: ['Budi', 'Putri', 'Rizky', 'Dewi', 'Arif', 'Sari', 'Bayu', 'Ayu'], n: ['Santoso', 'Wijaya', 'Saputra', 'Hidayat', 'Pratama', 'Kusuma', 'Siregar', 'Nugroho'] },
    ph: { v: ['Miguel', 'Andrea', 'Paolo', 'Bea', 'Carlo', 'Trisha', 'Jericho', 'Kim'], n: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Dela Cruz', 'Villanueva', 'Mendoza', 'Aquino'] },
    jp: { v: ['Haruto', 'Yui', 'Ren', 'Sakura', 'Sota', 'Aoi', 'Daiki', 'Hina', 'Kenji'], n: ['Tanaka', 'Ishikawa', 'Watanabe', 'Yamamoto', 'Nakamura', 'Fujiwara', 'Morita', 'Shimizu', 'Kondo'] },
    kr: { v: ['Min-jun', 'Seo-yeon', 'Ji-ho', 'Ha-eun', 'Do-yun', 'Ji-woo', 'Hyun-woo', 'Su-bin'], n: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Han'] },
    cn: { v: ['Wei', 'Lina', 'Hao', 'Mei', 'Jun', 'Xin', 'Yu', 'Lan'], n: ['Wang', 'Li', 'Chen', 'Liu', 'Zhang', 'Yang', 'Huang', 'Lin'] },
    au: { v: ['Jack', 'Chloe', 'Riley', 'Matilda', 'Cooper', 'Ruby', 'Lachlan', 'Sienna'], n: ['Mitchell', 'Hayes', 'Doherty', 'Cartwright', 'Fraser', 'Bowman', 'Sutherland', 'Kelly'] },
    nz: { v: ['Ethan', 'Aroha', 'Liam', 'Mere', 'Nikau', 'Isla', 'Tama', 'Ava'], n: ['Ngata', 'Parata', 'Wilson', 'Campbell', 'Morrison', 'Te Rangi', 'Walker', 'Paewai'] },
    us: { v: ['Tyler', 'Madison', 'Austin', 'Kayla', 'Cody', 'Brooke', 'Hunter', 'Savannah', 'Mason'], n: ['Calloway', 'Whitaker', 'Brooks', 'Sullivan', 'Carter', 'Dawson', 'Holloway', 'Prescott', 'Mercer'] },
    ca: { v: ['Liam', 'Chloé', 'Tristan', 'Maëlle', 'Owen', 'Brooke', 'Mathieu', 'Avery'], n: ['Tremblay', 'Gagnon', 'Lavoie', 'MacKenzie', 'Bouchard', 'Fraser', 'Côté', 'Leblanc'] },
    mx: { v: ['Santiago', 'Ximena', 'Emiliano', 'Valeria', 'Diego', 'Regina', 'Iker', 'Fernanda'], n: ['Reyes', 'Sandoval', 'Hernández', 'Guerrero', 'Mendoza', 'Castañeda', 'Vargas', 'Ibarra'] },
    co: { v: ['Andrés', 'Valentina', 'Sebastián', 'Daniela', 'Camilo', 'Mariana', 'Esteban', 'Laura'], n: ['Restrepo', 'Gómez', 'Cárdenas', 'Ospina', 'Zapata', 'Montes', 'Arango', 'Londoño'] },
    br: { v: ['Gabriel', 'Larissa', 'Thiago', 'Beatriz', 'Rafael', 'Camila', 'Lucas', 'Fernanda'], n: ['Castro', 'Oliveira', 'Souza', 'Almeida', 'Ribeiro', 'Barbosa', 'Teixeira', 'Moura'] },
    ar: { v: ['Facundo', 'Lucía', 'Tomás', 'Martina', 'Joaquín', 'Agustina', 'Nicolás', 'Micaela'], n: ['Fernández', 'Gutiérrez', 'Acosta', 'Romero', 'Medina', 'Benítez', 'Sosa', 'Giménez'] },
    cl: { v: ['Benjamín', 'Josefa', 'Vicente', 'Antonia', 'Matías', 'Catalina', 'Cristóbal', 'Florencia'], n: ['Muñoz', 'Rojas', 'Soto', 'Contreras', 'Figueroa', 'Espinoza', 'Valenzuela', 'Silva'] },
  };
  // Every other country takes the names of its language / region (a pool below, or the pool of a country above).
  const HD_NAMEN_POOLS = {
    arab: { v: ['Ahmed', 'Layla', 'Omar', 'Yasmin', 'Khalid', 'Huda', 'Faisal', 'Rania', 'Tariq', 'Nadia'], n: ['Haddad', 'Nasser', 'Khoury', 'Mansour', 'Saleh', 'Hamdan', 'Aziz', 'Barakat', 'Darwish', 'Al-Sayed'] },
    afghan: { v: ['Ahmad', 'Mariam', 'Farhad', 'Zahra', 'Hamid', 'Shabnam', 'Wahid', 'Laila'], n: ['Ahmadzai', 'Popal', 'Safi', 'Wardak', 'Hotak', 'Noori', 'Stanikzai', 'Sultani'] },
    zentralasien: { v: ['Daniyar', 'Madina', 'Timur', 'Aliya', 'Rustam', 'Dilnoza', 'Bekzat', 'Kamila'], n: ['Abdullayev', 'Nurlanov', 'Tursunov', 'Saparov', 'Ismailov', 'Akhmetov', 'Rakhimov', 'Bekov'] },
    georgien: { v: ['Giorgi', 'Nino', 'Levan', 'Tamar', 'Davit', 'Mariam', 'Irakli', 'Salome'], n: ['Beridze', 'Kapanadze', 'Gelashvili', 'Maisuradze', 'Lomidze', 'Tsiklauri', 'Kvaratskhelia', 'Jikia'] },
    armenien: { v: ['Aram', 'Ani', 'Tigran', 'Lilit', 'Armen', 'Narine', 'Davit', 'Mane'], n: ['Hakobyan', 'Petrosyan', 'Harutyunyan', 'Grigoryan', 'Avetisyan', 'Karapetyan', 'Vardanyan', 'Mkrtchyan'] },
    ostslawisch: { v: ['Alexei', 'Anastasia', 'Dmitri', 'Ekaterina', 'Ivan', 'Olga', 'Sergei', 'Natalia'], n: ['Smirnov', 'Volkov', 'Sokolov', 'Morozov', 'Lebedev', 'Kozlov', 'Novikov', 'Popov'] },
    suedslawisch: { v: ['Nikola', 'Jelena', 'Stefan', 'Milica', 'Aleksandar', 'Ivana', 'Nemanja', 'Tamara'], n: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović', 'Ilić', 'Pavlović'] },
    slowenien: { v: ['Luka', 'Nika', 'Jan', 'Ana', 'Žiga', 'Eva', 'Matej', 'Maja'], n: ['Krajnc', 'Zupančič', 'Kovačič', 'Potočnik', 'Mlakar', 'Kos', 'Vidmar', 'Golob'] },
    slowakei: { v: ['Martin', 'Zuzana', 'Peter', 'Lucia', 'Tomáš', 'Katarína', 'Marek', 'Jana'], n: ['Kováč', 'Baláž', 'Hudák', 'Polák', 'Molnár', 'Lukáč', 'Šimko', 'Oravec'] },
    rumaenien: { v: ['Andrei', 'Ioana', 'Mihai', 'Elena', 'Alexandru', 'Maria', 'Bogdan', 'Ana'], n: ['Popescu', 'Ionescu', 'Dumitrescu', 'Stan', 'Constantin', 'Munteanu', 'Moldovan', 'Rusu'] },
    litauen: { v: ['Lukas', 'Gabija', 'Mantas', 'Ieva', 'Tomas', 'Austėja', 'Paulius', 'Greta'], n: ['Kazlauskas', 'Petrauskas', 'Jankauskas', 'Stankevičius', 'Vasiliauskas', 'Butkus', 'Žukauskas', 'Paulauskas'] },
    lettland: { v: ['Jānis', 'Anna', 'Mārtiņš', 'Laura', 'Edgars', 'Elīna', 'Kārlis', 'Līga'], n: ['Bērziņš', 'Kalniņš', 'Ozoliņš', 'Liepiņš', 'Krūmiņš', 'Balodis', 'Zariņš', 'Vītols'] },
    estland: { v: ['Martin', 'Liis', 'Rasmus', 'Kertu', 'Markus', 'Triin', 'Kristjan', 'Mari'], n: ['Tamm', 'Saar', 'Sepp', 'Mägi', 'Kask', 'Kukk', 'Rebane', 'Ilves'] },
    albanien: { v: ['Arben', 'Elira', 'Besnik', 'Albana', 'Dritan', 'Mimoza', 'Ilir', 'Arta'], n: ['Hoxha', 'Shehu', 'Krasniqi', 'Gashi', 'Leka', 'Dushku', 'Kola', 'Bytyqi'] },
    island: { v: ['Gunnar', 'Sigrún', 'Einar', 'Katrín', 'Ólafur', 'Hildur', 'Birkir', 'Elín'], n: ['Jónsson', 'Sigurðsson', 'Magnússon', 'Gunnarsson', 'Einarsdóttir', 'Ólafsdóttir', 'Stefánsson', 'Björnsson'] },
    luxemburg: { v: ['Luc', 'Sophie', 'Marc', 'Anne', 'Gilles', 'Claire', 'Yves', 'Laura'], n: ['Schmit', 'Muller', 'Weber', 'Hoffmann', 'Wagner', 'Thill', 'Kremer', 'Reuter'] },
    katalanisch: { v: ['Jordi', 'Montserrat', 'Pau', 'Núria', 'Marc', 'Laia', 'Arnau', 'Mireia'], n: ['Puig', 'Vidal', 'Soler', 'Ferrer', 'Riba', 'Casals', 'Pujol', 'Serra'] },
    malta: { v: ['Joseph', 'Maria', 'Luke', 'Sarah', 'Matthew', 'Rebecca', 'Kurt', 'Nicole'], n: ['Borg', 'Camilleri', 'Vella', 'Farrugia', 'Zammit', 'Galea', 'Grech', 'Micallef'] },
    schottland: { v: ['Callum', 'Isla', 'Fraser', 'Eilidh', 'Ewan', 'Kirsty', 'Ruaridh', 'Morag'], n: ['MacLeod', 'Campbell', 'Murray', 'Robertson', 'Morrison', 'MacDonald', 'Paterson', 'Sinclair'] },
    wales: { v: ['Rhys', 'Cerys', 'Dafydd', 'Seren', 'Gareth', 'Ffion', 'Owain', 'Megan'], n: ['Jones', 'Evans', 'Morgan', 'Davies', 'Price', 'Llewellyn', 'Pritchard', 'Rees'] },
    latam: { v: ['Alejandro', 'Camila', 'Mateo', 'Valentina', 'Gabriel', 'Isabella', 'Sebastián', 'Sofía'], n: ['Rodríguez', 'Martínez', 'López', 'González', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Vargas', 'Rojas'] },
    karibik: { v: ['Andre', 'Shanice', 'Damion', 'Keisha', 'Marlon', 'Tanisha', 'Jermaine', 'Kimone'], n: ['Campbell', 'Brown', 'Williams', 'Thompson', 'Clarke', 'Grant', 'Reid', 'Francis'] },
    haiti: { v: ['Jean', 'Marie', 'Pierre', 'Nadège', 'Ricardo', 'Fabienne', 'Wilson', 'Darline'], n: ['Joseph', 'Jean-Baptiste', 'Charles', 'Désir', 'Augustin', 'Louis', 'Étienne', 'Dorval'] },
    lusoafrika: { v: ['João', 'Esperança', 'Manuel', 'Domingas', 'Paulo', 'Celeste', 'Edson', 'Lurdes'], n: ['dos Santos', 'Fernandes', 'Mendes', 'Lopes', 'Cardoso', 'Tavares', 'Gomes', 'Monteiro'] },
    westafrika: { v: ['Moussa', 'Aminata', 'Ibrahima', 'Fatou', 'Mamadou', 'Awa', 'Ousmane', 'Mariama'], n: ['Diallo', 'Traoré', 'Koné', 'Ndiaye', 'Camara', 'Sow', 'Coulibaly', 'Diop'] },
    zentralafrika: { v: ['Jean-Claude', 'Grâce', 'Patrice', 'Chantal', 'Hervé', 'Josiane', 'Didier', 'Sandrine'], n: ['Mukendi', 'Kasongo', 'Ilunga', 'Tshibangu', 'Mbemba', 'Ngoy', 'Mbala', 'Nkoulou'] },
    ruanda: { v: ['Jean-Paul', 'Aline', 'Eric', 'Diane', 'Olivier', 'Clarisse', 'Innocent', 'Divine'], n: ['Uwimana', 'Habimana', 'Niyonzima', 'Mugisha', 'Nshimiyimana', 'Ishimwe', 'Mukamana', 'Hakizimana'] },
    sierraleone: { v: ['Mohamed', 'Fatmata', 'Abu', 'Isatu', 'Samuel', 'Hawa', 'Alhaji', 'Mariatu'], n: ['Kamara', 'Sesay', 'Koroma', 'Bangura', 'Conteh', 'Jalloh', 'Turay', 'Mansaray'] },
    ostafrika: { v: ['Baraka', 'Neema', 'Juma', 'Rehema', 'Emmanuel', 'Upendo', 'Joseph', 'Grace'], n: ['Mushi', 'Mwakyusa', 'Okello', 'Kato', 'Mbwana', 'Ssali', 'Mrisho', 'Nyerere'] },
    aethiopien: { v: ['Abebe', 'Tigist', 'Dawit', 'Meron', 'Yonas', 'Selam', 'Henok', 'Hiwot'], n: ['Tesfaye', 'Girma', 'Tadesse', 'Mekonnen', 'Alemu', 'Kebede', 'Asfaw', 'Wolde'] },
    somalia: { v: ['Abdi', 'Hodan', 'Mohamed', 'Faadumo', 'Ahmed', 'Sahra', 'Yusuf', 'Ifrah'], n: ['Hassan', 'Warsame', 'Aden', 'Jama', 'Osman', 'Abdullahi', 'Ismail', 'Hersi'] },
    suedafrika2: { v: ['Tendai', 'Rudo', 'Tatenda', 'Chipo', 'Blessing', 'Nyasha', 'Kudzai', 'Thandiwe'], n: ['Moyo', 'Ncube', 'Banda', 'Phiri', 'Mwale', 'Sibanda', 'Dube', 'Tembo'] },
    madagaskar: { v: ['Hery', 'Voahangy', 'Rado', 'Fara', 'Tiana', 'Mamy', 'Fidy', 'Lova'], n: ['Rakoto', 'Rabe', 'Rasolo', 'Razafy', 'Randria', 'Rasoa', 'Ravelo', 'Andria'] },
    pakistan: { v: ['Ali', 'Ayesha', 'Hamza', 'Fatima', 'Bilal', 'Sana', 'Usman', 'Hira'], n: ['Khan', 'Malik', 'Qureshi', 'Butt', 'Chaudhry', 'Sheikh', 'Siddiqui', 'Mirza'] },
    bangladesch: { v: ['Rahim', 'Nusrat', 'Tanvir', 'Farzana', 'Arif', 'Shirin', 'Sakib', 'Mim'], n: ['Hossain', 'Rahman', 'Islam', 'Chowdhury', 'Ahmed', 'Sarkar', 'Uddin', 'Akter'] },
    srilanka: { v: ['Kasun', 'Dilini', 'Nuwan', 'Sanduni', 'Chamara', 'Ishara', 'Lahiru', 'Nadeesha'], n: ['Perera', 'Fernando', 'Silva', 'Bandara', 'Dissanayake', 'Ranasinghe', 'Herath', 'Gunawardena'] },
    nepal: { v: ['Aashish', 'Sita', 'Bikash', 'Anjali', 'Suman', 'Puja', 'Nabin', 'Sunita'], n: ['Shrestha', 'Thapa', 'Gurung', 'Tamang', 'Rai', 'Karki', 'Magar', 'Adhikari'] },
    malediven: { v: ['Ahmed', 'Aishath', 'Ibrahim', 'Mariyam', 'Hussain', 'Fathimath', 'Ali', 'Hawwa'], n: ['Rasheed', 'Hassan', 'Manik', 'Didi', 'Shareef', 'Naseem', 'Waheed', 'Saeed'] },
    malaiisch: { v: ['Ahmad', 'Nur', 'Hafiz', 'Siti', 'Amir', 'Aisyah', 'Faizal', 'Farah'], n: ['Abdullah', 'Ismail', 'Rahman', 'Hamzah', 'Ibrahim', 'Yusof', 'Hassan', 'Osman'] },
    singapur: { v: ['Jun Wei', 'Hui Min', 'Kai Xiang', 'Li Ting', 'Wei Jie', 'Xin Yi', 'Ryan', 'Rachel'], n: ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Goh', 'Chua', 'Koh'] },
    kambodscha: { v: ['Sokha', 'Chanthou', 'Vuthy', 'Sreymom', 'Dara', 'Bopha', 'Visal', 'Sopheap'], n: ['Sok', 'Chea', 'Heng', 'Meas', 'Phal', 'Sun', 'Keo', 'Chhim'] },
    laos: { v: ['Khamphone', 'Souk', 'Noy', 'Keo', 'Bounmy', 'Vanh', 'Somphone', 'Dao'], n: ['Vongsa', 'Phommachanh', 'Sisavath', 'Keomany', 'Inthavong', 'Xayavong', 'Sengsouk', 'Chanthala'] },
    myanmar: { v: ['Aung', 'Thandar', 'Kyaw', 'Hnin', 'Zaw', 'Ei', 'Htet', 'Su'], n: ['Min Htet', 'Win', 'Myint', 'Oo', 'Naing', 'Thu', 'Lwin', 'Aung'] },
    taiwan: { v: ['Yu-Ting', 'Chia-Hao', 'Hsin-Yi', 'Wei-Lun', 'Pei-Shan', 'Chih-Wei', 'Yi-Chen', 'Po-Han'], n: ['Chen', 'Lin', 'Huang', 'Chang', 'Lee', 'Wang', 'Wu', 'Tsai'] },
    hongkong: { v: ['Ka Ho', 'Wing Yan', 'Chun Kit', 'Hoi Ying', 'Wai Lun', 'Mei Ling', 'Tsz Hin', 'Ka Yan'], n: ['Chan', 'Wong', 'Leung', 'Cheung', 'Lau', 'Ho', 'Yeung', 'Chow'] },
    mongolei: { v: ['Temuulen', 'Saran', 'Ganbold', 'Nomin', 'Bat-Erdene', 'Anu', 'Tuguldur', 'Solongo'], n: ['Bold', 'Batbayar', 'Ganzorig', 'Enkhbat', 'Tsogt', 'Erdene', 'Altan', 'Bayar'] },
    pazifik: { v: ['Sione', 'Mele', 'Tevita', 'Losana', 'Viliami', 'Ana', 'Semisi', 'Litia'], n: ['Tupou', 'Fifita', 'Taufa', 'Naivalu', 'Koroi', 'Leota', 'Faleolo', 'Tuilagi'] },
    israel: { v: ['Noa', 'Yonatan', 'Tamar', 'Itai', 'Maya', 'Omer', 'Shira', 'Eitan'], n: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Friedman', 'Dahan', 'Avraham'] },
  };
  const HD_LAND_POOL = {
    sa: 'arab', qa: 'arab', kw: 'arab', bh: 'arab', om: 'arab', ye: 'arab', iq: 'arab', jo: 'arab', lb: 'arab', sy: 'arab', ps: 'arab',
    ly: 'arab', tn: 'arab', dz: 'arab', sd: 'arab', ss: 'ostafrika', mr: 'westafrika', eh: 'arab', km: 'arab', dj: 'somalia',
    af: 'afghan', tj: 'afghan', kz: 'zentralasien', uz: 'zentralasien', kg: 'zentralasien', tm: 'zentralasien', az: 'zentralasien',
    ge: 'georgien', am: 'armenien', ru: 'ostslawisch', by: 'ostslawisch', md: 'rumaenien', ro: 'rumaenien',
    rs: 'suedslawisch', ba: 'suedslawisch', me: 'suedslawisch', mk: 'suedslawisch', si: 'slowenien', sk: 'slowakei',
    lt: 'litauen', lv: 'lettland', ee: 'estland', al: 'albanien', xk: 'albanien', is: 'island', fo: 'island',
    lu: 'luxemburg', li: 'ch', mc: 'fr', ad: 'katalanisch', sm: 'it', va: 'it', mt: 'malta', cy: 'gr',
    'gb-eng': 'gb', 'gb-sct': 'schottland', 'gb-wls': 'wales', 'gb-nir': 'ie', gi: 'gb', im: 'gb', je: 'gb', gg: 'gb', fk: 'gb', sh: 'gb',
    gl: 'dk', ax: 'se', sj: 'no',
    pe: 'latam', ve: 'latam', ec: 'latam', bo: 'latam', py: 'latam', uy: 'latam', cr: 'latam', pa: 'latam', gt: 'latam', hn: 'latam',
    sv: 'latam', ni: 'latam', cu: 'latam', do: 'latam', pr: 'latam', gq: 'latam',
    jm: 'karibik', tt: 'karibik', bb: 'karibik', bs: 'karibik', ag: 'karibik', lc: 'karibik', vc: 'karibik', gd: 'karibik', dm: 'karibik',
    kn: 'karibik', gy: 'karibik', bz: 'karibik', bm: 'karibik', ky: 'karibik', vg: 'karibik', vi: 'karibik', tc: 'karibik', ai: 'karibik', ms: 'karibik',
    ht: 'haiti', gp: 'fr', mq: 'fr', gf: 'fr', bl: 'fr', mf: 'fr', pm: 'fr', re: 'fr', yt: 'fr', nc: 'fr', pf: 'fr', wf: 'fr', sc: 'fr',
    sr: 'nl', aw: 'nl', cw: 'nl', sx: 'nl', bq: 'nl',
    ao: 'lusoafrika', mz: 'lusoafrika', gw: 'lusoafrika', cv: 'lusoafrika', st: 'lusoafrika', tl: 'lusoafrika',
    sn: 'westafrika', ci: 'westafrika', ml: 'westafrika', bf: 'westafrika', ne: 'westafrika', gn: 'westafrika', tg: 'westafrika', bj: 'westafrika',
    cm: 'zentralafrika', ga: 'zentralafrika', cg: 'zentralafrika', cd: 'zentralafrika', cf: 'zentralafrika', td: 'zentralafrika',
    rw: 'ruanda', bi: 'ruanda', lr: 'sierraleone', sl: 'sierraleone', gm: 'sierraleone',
    tz: 'ostafrika', ug: 'ostafrika', et: 'aethiopien', er: 'aethiopien', so: 'somalia',
    zw: 'suedafrika2', zm: 'suedafrika2', mw: 'suedafrika2', bw: 'suedafrika2', na: 'suedafrika2', ls: 'suedafrika2', sz: 'suedafrika2',
    mg: 'madagaskar', mu: 'in', pk: 'pakistan', bd: 'bangladesch', lk: 'srilanka', np: 'nepal', bt: 'nepal', mv: 'malediven',
    my: 'malaiisch', bn: 'malaiisch', sg: 'singapur', kh: 'kambodscha', la: 'laos', mm: 'myanmar',
    tw: 'taiwan', hk: 'hongkong', mo: 'hongkong', mn: 'mongolei', kp: 'kr',
    fj: 'pazifik', to: 'pazifik', ws: 'pazifik', as: 'pazifik', ck: 'pazifik', nu: 'pazifik', tv: 'pazifik', ki: 'pazifik', nr: 'pazifik',
    vu: 'pazifik', sb: 'pazifik', pg: 'pazifik', fm: 'pazifik', mh: 'pazifik', pw: 'pazifik', gu: 'pazifik', mp: 'pazifik', tk: 'pazifik',
    il: 'israel',
  };
  // Every country / territory with a flag in img/flaggen (243).
  const HD_LAND_CODES = ('ad ae af ag ai al am ao ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bw by bz ca cd cf cg ch ci ck cl cm cn co cr cu cv cw cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb-eng gb-nir gb-sct gb-wls gb gd ge gf gg gh gi gl gm gn gp gq gr gt gu gw gy hk hn hr ht hu id ie il im in iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tg th tj tk tl tm tn to tr tt tv tw tz ua ug us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw').split(' ');
  const HD_LAND_SET = new Set(HD_LAND_CODES);
  // The names of a country: its own pool, or the pool of its language / region.
  function hdLandNamen(code) {
    if (HD_LAENDER[code]) return HD_LAENDER[code];
    const p = HD_LAND_POOL[code];
    return (p && (HD_NAMEN_POOLS[p] || HD_LAENDER[p])) || HD_LAENDER.gb;
  }
  // The old name pool (v2.0): its surnames point to a country, so the NPCs named before keep a fitting flag.
  const HD_ALT_NACHNAME_LAND = { Kovac: 'hr', Lindqvist: 'se', Moreau: 'fr', Okafor: 'ng', Tanaka: 'jp', Brandt: 'de', Castell: 'es', Novak: 'cz',
    Reyes: 'mx', Halvorsen: 'no', Duval: 'fr', Mensah: 'gh', Petrov: 'bg', Sandoval: 'mx', Whitlock: 'gb', Ferreira: 'pt', Kaplan: 'tr',
    Ishikawa: 'jp', Varga: 'hu', Delacroix: 'fr', Osei: 'gh', Marchetti: 'it', Nyberg: 'se', Quinn: 'ie', Rahimi: 'ir', Solberg: 'no',
    Thorne: 'gb', Adeyemi: 'ng', Calloway: 'us', Bianchi: 'it', Strand: 'se', Morales: 'es', Hartmann: 'de', Zielinski: 'pl', Achebe: 'ng',
    Lund: 'dk', Navarro: 'es', Castro: 'br', Fontaine: 'fr', Mbeki: 'za' };

  // ---- flags: the files of flag-icons (MIT, img/flaggen/LICENSE.txt), 4:3, one per country ----------------------------
  // v3.0 GEMELDET: "Add all the country flags, I don't see all the countries." Hand-drawn flags covered the 47 countries
  // of the first version; now every country and territory has its real flag from the bundled files.
  function hdLandFlagge(code, hoehe) {
    const h = hoehe || 14, w = Math.round(h * 4 / 3);
    const name = hdLandName(code).replace(/[<>"&]/g, '');
    // (attribute built in two parts: the build's reference check reads every literal src=" as a fixed file)
    return '<img class="hd-flagge" ' + 'src' + '="img/flaggen/' + encodeURIComponent(code) + '.svg" width="' + w + '" height="' + h + '" alt="' + name + '" title="' + name + '" loading="lazy" decoding="async">';
  }
  const HD_LAND_EIGENE_NAMEN = {
    'gb-eng': { de: 'England', en: 'England', es: 'Inglaterra' }, 'gb-sct': { de: 'Schottland', en: 'Scotland', es: 'Escocia' },
    'gb-wls': { de: 'Wales', en: 'Wales', es: 'Gales' }, 'gb-nir': { de: 'Nordirland', en: 'Northern Ireland', es: 'Irlanda del Norte' },
  };
  function hdLandName(code) {
    const eigen = HD_LAND_EIGENE_NAMEN[code];
    if (eigen) return eigen[typeof lang === 'string' && eigen[lang] ? lang : 'en'];
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
      for (const s of sprachen) { const m = /[-_]([a-z]{2})$/i.exec(s || ''); if (m && HD_LAND_SET.has(m[1].toLowerCase())) return m[1].toLowerCase(); }
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
    for (const c of Object.keys(HD_LAENDER)) if (nach && HD_LAENDER[c].n.includes(nach)) return c;
    return null;
  }
  function hdLand(car) {
    if (!car || !car.device) return null;
    const id = String(car.device.id), alle = hdLandAlle();
    if (alle[id] && HD_LAND_SET.has(alle[id])) return alle[id];
    // First time: from the name if it is one of ours, players from the browser, otherwise a drawn country.
    const code = hdLandAusName(car.alias) || (/^player/.test(car.role || '') ? hdLandBrowser() : hdLandZiehen(car));
    alle[id] = code; hdLandSchreiben();
    return code;
  }
  function hdLandSetzen(car, code) {
    if (!car || !car.device || !HD_LAND_SET.has(code)) return;
    hdLandAlle()[String(car.device.id)] = code; hdLandSchreiben();
  }
  // A country for a new NPC: one nobody in the garage has yet, if possible - so the field is international.
  function hdLandZiehen(car) {
    let belegt = new Set();
    try { garage.forEach((c) => { if (c !== car && c.device) { const x = hdLandAlle()[String(c.device.id)]; if (x) belegt.add(x); } }); } catch (e) { /* no garage */ }
    // Every country can come up; the 47 with their own name pool (the bigger racing nations) three times as often.
    const gewicht = (c) => (HD_LAENDER[c] ? 3 : 1);
    let pool = HD_LAND_CODES.filter((c) => !belegt.has(c));
    if (!pool.length) pool = HD_LAND_CODES;
    let summe = pool.reduce((s0, c) => s0 + gewicht(c), 0), r = Math.random() * summe;
    for (const c of pool) { r -= gewicht(c); if (r < 0) return c; }
    return pool[pool.length - 1];
  }
  // A name from the car's country (new country for an NPC without one).
  function hdNameFuerAuto(car, belegt) {
    const code = (car && car.device && hdLandAlle()[String(car.device.id)]) || (car && car.device ? hdLand(car) : hdLandZiehen(car));
    const L = hdLandNamen(code);
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
    _nameFuer: (code) => { const L = hdLandNamen(code); return L.v[0] + ' ' + L.n[0]; }, _neuerName: (car) => hdNameFuerAuto(car) });
