const API_URL = '/api';

let categories = [];
let products = [];
let shop = {
  shopName: 'Guardian Store',
  whatsappNumber: ''
};

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

  if (sectionId === 'knowledge') {
    loadKeywords();
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
  const number = shop.whatsappNumber || '6281234567890';
  const text = encodeURIComponent(
    `Halo kak, saya mau tanya produk kategori ${categoryName}.`
  );

  return `https://wa.me/${number}?text=${text}`;
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_URL}/categories`);
    const data = await response.json();

    categories = data.categories || [];
    shop = {
      shopName: data.shopName || 'Guardian Store',
      whatsappNumber: data.whatsappNumber || ''
    };

    renderCategories();
  } catch (error) {
    console.error('Error loading categories:', error);
    showNotification('Gagal memuat kategori.');
  }
}

function renderCategories() {
  const container = document.getElementById('categoryGrid');

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = '<p>Belum ada kategori yang tersedia.</p>';
    return;
  }

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

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products?category=personal-care`);
    const data = await response.json();

    products = data.products || [];
    renderProducts();
  } catch (error) {
    console.error('Error loading products:', error);
    showNotification('Gagal memuat produk Personal Care.');
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
        <img
          src="${product.image || ''}"
          alt="${escapeHtml(product.name)}"
          onerror="this.style.display='none'"
        />

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

async function reloadDatasets() {
  try {
    const response = await fetch(`${API_URL}/reload-datasets`, {
      method: 'POST'
    });

    const data = await response.json();

    showNotification(data.message || 'Dataset berhasil dimuat ulang.');

    await loadCategories();
    await loadProducts();
    await loadDatasetSummary();
  } catch (error) {
    console.error('Error reloading datasets:', error);
    showNotification('Gagal reload dataset.');
  }
}

async function loadDatasetSummary() {
  const container = document.getElementById('datasetSummary');

  if (!container) return;

  try {
    const response = await fetch(`${API_URL}/datasets`);
    const data = await response.json();

    container.innerHTML = `
      <div class="summary-card">
        <span>Total Dokumen RAG</span>
        <strong>${data.totalDocuments || 0}</strong>
      </div>

      <div class="summary-card">
        <span>Dataset CSV</span>
        <strong>${data.datasets ? data.datasets.length : 0}</strong>
      </div>

      <div class="summary-card">
        <span>Produk Personal Care</span>
        <strong>${products.length}</strong>
      </div>
    `;
  } catch (error) {
    console.error('Error loading dataset summary:', error);
    container.innerHTML = '<p>Gagal memuat ringkasan dataset.</p>';
  }
}

async function loadKeywords() {
  const container = document.getElementById('keywordItems');

  if (!container) return;

  try {
    const response = await fetch(`${API_URL}/knowledge/keywords`);
    const data = await response.json();

    const entries = Object.entries(data.responses || {});

    if (!entries.length) {
      container.innerHTML = '<p>Belum ada keyword.</p>';
      return;
    }

    container.innerHTML = entries.map(([keyword, responseText]) => {
      return `
        <div class="keyword-item">
          <div>
            <strong>${escapeHtml(keyword)}</strong>
            <p>${escapeHtml(responseText)}</p>
          </div>

          <button
            class="btn danger small"
            onclick="deleteKeyword('${encodeURIComponent(keyword)}')"
          >
            Hapus
          </button>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading keywords:', error);
    container.innerHTML = '<p>Gagal memuat keyword.</p>';
  }
}

async function saveKeyword() {
  const keywordInput = document.getElementById('keyword');
  const responseInput = document.getElementById('response');

  if (!keywordInput || !responseInput) return;

  const keyword = keywordInput.value.trim().toLowerCase();
  const responseText = responseInput.value.trim();

  if (!keyword || !responseText) {
    showNotification('Keyword dan respons harus diisi.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/knowledge/keyword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keyword,
        response: responseText
      })
    });

    const data = await response.json();

    showNotification(data.message || 'Keyword berhasil disimpan.');

    if (data.success) {
      clearForm();
      loadKeywords();
    }
  } catch (error) {
    console.error('Error saving keyword:', error);
    showNotification('Gagal menyimpan keyword.');
  }
}

async function deleteKeyword(encodedKeyword) {
  const keyword = decodeURIComponent(encodedKeyword);

  if (!confirm(`Hapus keyword "${keyword}"?`)) return;

  try {
    const response = await fetch(`${API_URL}/knowledge/keyword/${encodedKeyword}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    showNotification(data.message || 'Keyword berhasil dihapus.');

    if (data.success) {
      loadKeywords();
    }
  } catch (error) {
    console.error('Error deleting keyword:', error);
    showNotification('Gagal menghapus keyword.');
  }
}

function clearForm() {
  const keywordInput = document.getElementById('keyword');
  const responseInput = document.getElementById('response');

  if (keywordInput) keywordInput.value = '';
  if (responseInput) responseInput.value = '';

  if (keywordInput) keywordInput.focus();
}

async function init() {
  await loadCategories();
  await loadProducts();
  await loadDatasetSummary();
}

init();