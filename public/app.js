let products = [];

const shop = {
  shopName: 'Guardian Store',
  whatsappNumber: '6281234567890'
};

const categories = [
  {
    name: 'Kosmetik',
    description: 'Kategori kosmetik untuk produk makeup dan kecantikan. Dataset bisa diisi anggota kelompok terkait.',
    productCount: 0
  },
  {
    name: 'Skincare',
    description: 'Kategori skincare untuk perawatan wajah. Dataset bisa diisi anggota kelompok terkait.',
    productCount: 0
  },
  {
    name: 'Personal Care',
    description: 'Kategori yang kamu kerjakan. Berisi data hasil scraping Shopee dari file CSV kamu.',
    productCount: 297
  },
  {
    name: 'Health',
    description: 'Kategori kesehatan dan kebutuhan harian terkait health.',
    productCount: 0
  },
  {
    name: 'Guardian Brand',
    description: 'Kategori produk private label atau brand Guardian.',
    productCount: 0
  }
];

function showNotification(message) {
  const notification = document.getElementById('notification');

  if (!notification) {
    alert(message);
    return;
  }

  notification.textContent = message;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function switchSection(sectionId, buttonElement) {
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.remove('active');
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.remove('active');
  });

  const selectedPanel = document.getElementById(sectionId);
  if (selectedPanel) {
    selectedPanel.classList.add('active');
  }

  if (buttonElement) {
    buttonElement.classList.add('active');
  }

  if (sectionId === 'products') {
    renderProducts();
  }

  if (sectionId === 'settings') {
    loadDatasetSummary();
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (match) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[match];
  });
}

function whatsappLink(categoryName) {
  const number = shop.whatsappNumber;
  const text = encodeURIComponent(
    `Halo kak, saya mau tanya produk kategori ${categoryName}.`
  );

  return `https://wa.me/${number}?text=${text}`;
}

function renderCategories() {
  const container = document.getElementById('categoryGrid');

  if (!container) return;

  container.innerHTML = categories.map((category, index) => {
    return `
      <article class="category-card">
        <div>
          <div class="category-icon">${index + 1}</div>
          <h3>${escapeHtml(category.name)}</h3>
          <p>${escapeHtml(category.description)}</p>
        </div>

        <div>
          <span class="count-pill">${category.productCount || 0} produk</span>
          <a
            class="product-link"
            href="${whatsappLink(category.name)}"
            target="_blank"
            style="display: block; margin-top: 12px;"
          >
            Tanya via WhatsApp →
          </a>
        </div>
      </article>
    `;
  }).join('');
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function csvToObjects(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const item = {};

    headers.forEach((header, index) => {
      item[header] = values[index] || '';
    });

    return item;
  });
}

function normalizeProduct(row) {
  const keys = Object.keys(row);

  const findValue = (keywords) => {
    const key = keys.find((item) => {
      const lower = item.toLowerCase();
      return keywords.some((keyword) => lower.includes(keyword));
    });

    return key ? row[key] : '';
  };

  return {
    name:
      findValue(['name', 'nama', 'title', 'produk', 'product']) ||
      Object.values(row).find((value) => value && value.length > 3) ||
      'Produk Personal Care',
    image: findValue(['image', 'img', 'gambar', 'src']),
    url: findValue(['url', 'link', 'href']) || '#',
    discount: findValue(['diskon', 'discount', 'promo']),
    badge: findValue(['badge', 'label', 'tag']),
    sold: findValue(['sold', 'terjual'])
  };
}

async function loadProducts() {
  try {
    const response = await fetch('data/personal-care.csv');

    if (!response.ok) {
      throw new Error('CSV tidak ditemukan');
    }

    const csvText = await response.text();
    const rows = csvToObjects(csvText);

    products = rows.map(normalizeProduct).filter((product) => product.name);

    const personalCare = categories.find((category) => category.name === 'Personal Care');
    if (personalCare) {
      personalCare.productCount = products.length;
    }

    renderCategories();
    renderProducts();
    loadDatasetSummary();
  } catch (error) {
    console.error('Error loading CSV:', error);
    showNotification('CSV Personal Care belum terbaca di Vercel.');
    renderCategories();
  }
}

function renderProducts() {
  const container = document.getElementById('productGrid');
  const searchInput = document.getElementById('productSearch');

  if (!container) return;

  const keyword = searchInput ? searchInput.value.toLowerCase() : '';

  const filtered = products.filter((product) => {
    const productName = String(product.name || '').toLowerCase();
    return productName.includes(keyword);
  });

  if (!filtered.length) {
    container.innerHTML = '<p>Tidak ada produk yang cocok dengan pencarian.</p>';
    return;
  }

  container.innerHTML = filtered.slice(0, 60).map((product) => {
    return `
      <article class="product-card">
        ${
          product.image
            ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'" />`
            : ''
        }

        <div class="product-body">
          <h3>${escapeHtml(product.name)}</h3>

          <div class="meta">
            ${product.discount ? `<span>${escapeHtml(product.discount)}</span>` : ''}
            ${product.badge ? `<span>${escapeHtml(product.badge)}</span>` : ''}
            ${product.sold ? `<span>${escapeHtml(product.sold)}</span>` : ''}
          </div>

          <a class="product-link" href="${product.url || '#'}" target="_blank">
            Lihat produk →
          </a>
        </div>
      </article>
    `;
  }).join('');
}

function reloadDatasets() {
  showNotification('Dataset dimuat ulang dari file CSV.');
  loadProducts();
}

function loadDatasetSummary() {
  const container = document.getElementById('datasetSummary');

  if (!container) return;

  container.innerHTML = `
    <div class="summary-card">
      <span>Total Kategori</span>
      <strong>${categories.length}</strong>
    </div>

    <div class="summary-card">
      <span>Produk Personal Care</span>
      <strong>${products.length}</strong>
    </div>

    <div class="summary-card">
      <span>Status Vercel</span>
      <strong>Online</strong>
    </div>
  `;
}

function init() {
  renderCategories();
  loadProducts();
}

init();