import { useLoaderData, useFetcher } from 'react-router';
import { useState } from 'react';
import prisma from '../../db.server';

export async function loader() {
  const products = await prisma.product.findMany({
    orderBy: { productName: 'asc' },
  });
  return { products };
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
    return { success: true };
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
}

export default function ProductMapping() {
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

  return (
    <div className="flex">
      <div className="w-1/3 border-r p-4 overflow-auto">
        <h3 className="font-bold mb-2">Products</h3>
        <ul className="space-y-1">
          {products.map((product) => (
            <li
              key={product.productId}
              onClick={() => setSelectedProductId(product.productId)}
              className={`cursor-pointer p-2 rounded ${
                selectedProductId === product.productId ? 'bg-blue-100' : 'hover:bg-gray-100'
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

      <div className="flex-1 p-4">
        {selectedProduct ? (
          <fetcher.Form method="post" onSubmit={handleSave}>
            <input type="hidden" name="productId" value={selectedProduct.productId} />
            <h2 className="text-xl font-bold mb-4">Edit: {selectedProduct.productName}</h2>

            <div className="space-y-4">
              <div>
                <label className="block mb-1">Product Type</label>
                <div className="space-x-4">
                  <label>
                    <input
                      type="checkbox"
                      name="rawProductFlag"
                      value="true"
                      defaultChecked={selectedProduct.rawProductFlag}
                    /> Root (Raw) Product
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="isCombo"
                      value="true"
                      defaultChecked={selectedProduct.isCombo}
                    /> Combo Product
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="isDuplicate"
                      value="true"
                      defaultChecked={selectedProduct.isDuplicate}
                    /> Duplicate Product
                  </label>
                </div>
              </div>

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