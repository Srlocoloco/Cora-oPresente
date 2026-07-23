<?php
// A hospedagem exige um index.php na raiz do site (KingHost prioriza .php
// sobre .html como página inicial). Este arquivo só serve o index.html de
// verdade, gerado pelo "npm run build" — não precisa editar nada aqui.
readfile(__DIR__ . '/index.html');
