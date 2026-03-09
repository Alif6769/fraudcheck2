import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useState } from 'react';
import { prisma } from '~/db.server';

export async function loader() {
  const products = await prisma.product.findMany({
    orderBy: { productName: 'asc' },
  });
  return json({ products });
}

export async function action({ request }) {
  const formData = await request.formData();
  const productId = formData.get('productId');
  const actionType = formData.get('actionType');

  if (actionType === 'update') {
    const rawProductFlag = formData.get('rawProductFlag') === 'true';
    const isCombo = formData.get('isCombo') === 'true';
    const isDuplicate = formData.get('isDuplicate') === 'true';
    const rootProductId = formData.get('rootProductId') || null;
    const comboReference = formData.get('comboReference') || null;

    await prisma.product.update({
      where: { productId },
      data: {
        rawProductFlag,
        isCombo,
        isDuplicate,
        rootProductId,
        comboReference,
      },
    });
    return json({ success: true });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}

export default function InventoryPage() {
  const { products } = useLoaderData();
  const [selectedProductId, setSelectedProductId] = useState(null);
  const selectedProduct = products.find(p => p.productId === selectedProductId);
  const fetcher = useFetcher();

  const handleSave = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    formData.append('actionType', 'update');
    fetcher.submit(formData, { method: 'post' });
  };

  // For combo editor, we need to manage a list of components
  // We'll keep a local state for combo items, then serialize to JSON on save.
  // But for simplicity, we'll use a textarea to edit JSON directly (for now).
  // In production, you'd build a proper multi‑select with quantity inputs.

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-1/4 border-r p-4 overflow-auto">
        <h2 className="text-lg font-bold mb-4">Products</h2>
        <ul className="space-y-1">
          {products.map((product) => (
            <li
              key={product.productId}
              onClick={() => setSelectedProductId(product.productId)}
              className={`cursor-pointer p-2 rounded ${
                selectedProductId === product.productId
                  ? 'bg-blue-100'
                  : 'hover:bg-gray-100'
              }`}
            >
              {product.productName}
              <span className="ml-2 text-xs text-gray-500">
                {product.rawProductFlag && '🟢'}
                {product.isCombo && '🔵'}
                {product.isDuplicate && '🟠'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Main panel */}
      <div className="flex-1 p-4">
        {selectedProduct ? (
          <fetcher.Form method="post" onSubmit={handleSave}>
            <input type="hidden" name="productId" value={selectedProduct.productId} />
            <h2 className="text-xl font-bold mb-4">Edit: {selectedProduct.productName}</h2>

            <div className="space-y-4">
              {/* Product type checkboxes */}
              <div>
                <label className="block mb-1">Product Type</label>
                <div className="space-x-4">
                  <label>
                    <input
                      type="checkbox"
                      name="rawProductFlag"
                      value="true"
                      defaultChecked={selectedProduct.rawProductFlag}
                    />{' '}
                    Root (Raw) Product
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="isCombo"
                      value="true"
                      defaultChecked={selectedProduct.isCombo}
                    />{' '}
                    Combo Product
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="isDuplicate"
                      value="true"
                      defaultChecked={selectedProduct.isDuplicate}
                    />{' '}
                    Duplicate Product
                  </label>
                </div>
              </div>

              {/* If duplicate, choose root product */}
              {selectedProduct.isDuplicate && (
                <div>
                  <label className="block mb-1">Root Product (for duplicate)</label>
                  <select
                    name="rootProductId"
                    defaultValue={selectedProduct.rootProductId || ''}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">-- Select root product --</option>
                    {products
                      .filter(p => p.rawProductFlag)
                      .map(p => (
                        <option key={p.productId} value={p.productId}>
                          {p.productName}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* If combo, define composition */}
              {selectedProduct.isCombo && (
                <div>
                  <label className="block mb-1">Composition (JSON)</label>
                  <textarea
                    name="comboReference"
                    rows="6"
                    defaultValue={selectedProduct.comboReference || ''}
                    className="w-full p-2 border rounded font-mono text-sm"
                    placeholder='[{"productId": "...", "quantity": 1}, ...]'
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a JSON array of objects with productId and quantity.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={fetcher.state === 'submitting'}
              >
                {fetcher.state === 'submitting' ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </fetcher.Form>
        ) : (
          <p className="text-gray-500">Select a product from the list.</p>
        )}
      </div>
    </div>
  );
}