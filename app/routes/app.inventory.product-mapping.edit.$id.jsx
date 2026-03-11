// app/routes/app.inventory.product-mapping.$id.jsx
import { redirect } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from "react";

/* =========================
   LOADER – load product + all products
========================= */
export async function loader({ params, request }) {
  const { id } = params;
  if (!id) {
    throw new Response("Product ID required", { status: 400 });
  }

  const { session } = await authenticate.admin(request);

  // Load the product to edit
  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  // Load all products (used for rawProductOptions and combos)
  const products = await prisma.product.findMany({
    orderBy: { productName: "asc" },
  });

  return { product, products, shop: session.shop };
}

/* =========================
   ACTION – update or delete
========================= */
export async function action({ params, request }) {
  const { id } = params;
  if (!id) {
    throw new Response("Product ID required", { status: 400 });
  }

  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    await prisma.product.delete({ where: { id } });
    // After delete, go back to list
    return redirect("/app/inventory/product-mapping");
  }

  if (intent === "save") {
    // Rebuild the payload like in your original handleSubmit
    const products = await prisma.product.findMany({
      orderBy: { productName: "asc" },
    });
    const firstRaw = products.find((p) => p.rawProductFlag);

    // Parse basic fields
    const productId = formData.get("productId") || "";
    const productName = formData.get("productName") || "";
    const description = formData.get("description") || "";
    const price = parseFloat(formData.get("price") || "0") || 0;
    const quantity = parseInt(formData.get("quantity") || "0", 10) || 0;
    let inventoryCategory = formData.get("inventoryCategory") || "";
    const productCategory = formData.get("productCategory") || "";
    const baseDatetime =
      formData.get("baseDatetime") ||
      new Date().toISOString();

    const isCombo = formData.get("isCombo") === "on";
    const isDuplicate = formData.get("isDuplicate") === "on";
    const rawProductFlag = formData.get("rawProductFlag") === "on";

    // Combo components
    const comboRef = formData.getAll("comboReference") || []; // JSON strings
    let comboReference = comboRef.map((str) => {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    }).filter(Boolean);

    if (isCombo && firstRaw) {
      comboReference = comboReference.map((comp) => ({
        productId: comp.productId || firstRaw.productId,
        quantity: parseInt(comp.quantity || "1", 10) || 1,
      }));
    }

    // Root product for duplicates
    let rootProductId = formData.get("rootProductId") || "";
    if (isDuplicate && !rootProductId && firstRaw) {
      rootProductId = firstRaw.productId;
    }

    // Derive inventoryCategory if not given
    if (!inventoryCategory) {
      if (isCombo) inventoryCategory = "comboProducts";
      else if (isDuplicate) inventoryCategory = "duplicateProducts";
      else if (rawProductFlag) inventoryCategory = "rawProducts";
    }

    const payload = {
      productId,
      productName,
      description,
      price,
      quantity,
      inventoryCategory,
      productCategory,
      isCombo,
      isDuplicate,
      rawProductFlag,
      rootProductId: rootProductId || null,
      comboReference:
        comboReference && comboReference.length
          ? JSON.stringify(comboReference)
          : null,
      baseDatetime,
    };

    await prisma.product.update({
      where: { id },
      data: payload,
    });

    return redirect("/app/inventory/product-mapping");
  }

  return new Response("Unsupported intent", { status: 400 });
}



/* =========================
   COMPONENT – Edit Product
========================= */
export default function ProductEdit() {
  const { product, products } = useLoaderData();
  const fetcher = useFetcher();

  const [formData, setFormData] = useState(() => {
    let comboParsed = [];
    try {
      comboParsed = product.comboReference
        ? JSON.parse(product.comboReference)
        : [];
    } catch {
      comboParsed = [];
    }

    return {
      productId: product.productId || "",
      productName: product.productName || "",
      description: product.description || "",
      price: product.price?.toString() || "",
      quantity: product.quantity?.toString() || "",
      inventoryCategory: product.inventoryCategory || "",
      productCategory: product.productCategory || "",
      isCombo: product.isCombo || false,
      isDuplicate: product.isDuplicate || false,
      rawProductFlag: product.rawProductFlag || false,
      rootProductId: product.rootProductId || "",
      comboReference: comboParsed,
      baseDatetime: product.baseDatetime
        ? new Date(product.baseDatetime).toISOString().slice(0, 16)
        : "",
    };
  });

  const isSubmitting = fetcher.state === "submitting";
  const currentIntent =
    fetcher.submission?.formData?.get("intent") || null;

  const handleFieldChange = (field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Because we're using web components, events are DOM Events.
  const handleTextFieldInput = (field) => (event) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.currentTarget.value,
    }));
  };

  const handleSelectChange = (field) => (event) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.currentTarget.value,
    }));
  };

  const handleCheckboxChange = (field, othersToClear = []) => (event) => {
    const checked = event.currentTarget.checked;
    setFormData((prev) => {
      const updated = { ...prev, [field]: checked };
      // Clear mutually exclusive flags
      if (checked && othersToClear.length > 0) {
        for (const other of othersToClear) {
          updated[other] = false;
        }
      }
      return updated;
    });
  };

  const handleComboChange = (index, field) => (event) => {
    const value = event.currentTarget.value;
    setFormData((prev) => {
      const next = [...prev.comboReference];
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return { ...prev, comboReference: next };
    });
  };

  const addComboProduct = () => {
    setFormData((prev) => ({
      ...prev,
      comboReference: [
        ...prev.comboReference,
        { productId: "", quantity: 1 },
      ],
    }));
  };

  const removeComboProduct = (index) => {
    setFormData((prev) => {
      const next = [...prev.comboReference];
      next.splice(index, 1);
      return { ...prev, comboReference: next };
    });
  };

  const rawProductOptions = products
    .filter((p) => p.rawProductFlag)
    .map((p) => ({
      label: p.productName,
      value: p.productId,
    }));

  const inventoryOptions = [
    { label: "Combo Products", value: "comboProducts" },
    { label: "Raw Products", value: "rawProducts" },
    { label: "Duplicate Products", value: "duplicateProducts" },
  ];

  const productOptions = [
    { label: "Combs", value: "combs" },
    { label: "Hair Brushes", value: "hairBrushes" },
    { label: "Scalp Massager", value: "scalpMassager" },
    { label: "Hair Pins", value: "hairPins" },
  ];

  const handleSubmit = () => {
    const fd = new FormData();

    fd.set("intent", "save");
    fd.set("productId", formData.productId);
    fd.set("productName", formData.productName);
    fd.set("description", formData.description);
    fd.set("price", formData.price);
    fd.set("quantity", formData.quantity);
    fd.set("inventoryCategory", formData.inventoryCategory);
    fd.set("productCategory", formData.productCategory);
    fd.set("baseDatetime", formData.baseDatetime);

    if (formData.isCombo) fd.set("isCombo", "on");
    if (formData.isDuplicate) fd.set("isDuplicate", "on");
    if (formData.rawProductFlag) fd.set("rawProductFlag", "on");

    if (formData.rootProductId) {
      fd.set("rootProductId", formData.rootProductId);
    }

    // comboReference items as JSON strings
    formData.comboReference.forEach((comp) => {
      fd.append(
        "comboReference",
        JSON.stringify({
          productId: comp.productId,
          quantity: comp.quantity,
        }),
      );
    });

    fetcher.submit(fd, { method: "post" });
  };

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <s-page
      heading={product ? "Edit product" : "Add product"}
      inlineSize="large"
    >
      <s-section padding="base">
        <s-stack gap="base">
          {/* Basic info */}
          <s-stack gap="small">
            {/* Product ID (read-only here) */}
            <s-text type="strong">
              Product ID: {formData.productId}
            </s-text>

            <s-text-field
              label="Product name"
              value={formData.productName}
              onInput={handleTextFieldInput("productName")}
              required
            />

            <s-text-field
              label="Description"
              value={formData.description}
              onInput={handleTextFieldInput("description")}
              // App Home TextArea is s-text-area, but s-text-field can still hold long text.
            />

            <s-text-field
              label="Price"
              type="number"
              value={formData.price}
              onInput={handleTextFieldInput("price")}
              prefix="$"
            />

            <s-text-field
              label="Quantity"
              type="number"
              value={formData.quantity}
              onInput={handleTextFieldInput("quantity")}
            />

            <s-select
              label="Inventory category"
              value={formData.inventoryCategory}
              onChange={handleSelectChange("inventoryCategory")}
            >
              <s-option value="">Select inventory category</s-option>
              {inventoryOptions.map((opt) => (
                <s-option key={opt.value} value={opt.value}>
                  {opt.label}
                </s-option>
              ))}
            </s-select>

            <s-select
              label="Product category"
              value={formData.productCategory}
              onChange={handleSelectChange("productCategory")}
            >
              <s-option value="">Select product category</s-option>
              {productOptions.map((opt) => (
                <s-option key={opt.value} value={opt.value}>
                  {opt.label}
                </s-option>
              ))}
            </s-select>

            <s-text-field
              label="Base datetime"
              type="datetime-local"
              value={formData.baseDatetime}
              onInput={handleTextFieldInput("baseDatetime")}
            />
          </s-stack>

          {/* Flags */}
          <s-stack gap="small">
            <s-checkbox
              label="Is combo product"
              checked={formData.isCombo}
              onInput={handleCheckboxChange("isCombo", [
                "isDuplicate",
                "rawProductFlag",
              ])}
            />
            <s-checkbox
              label="Is duplicate product"
              checked={formData.isDuplicate}
              onInput={handleCheckboxChange("isDuplicate", [
                "isCombo",
                "rawProductFlag",
              ])}
            />
            <s-checkbox
              label="Raw product"
              checked={formData.rawProductFlag}
              onInput={handleCheckboxChange("rawProductFlag", [
                "isCombo",
                "isDuplicate",
              ])}
            />
          </s-stack>

          {/* Combo products */}
          {formData.isCombo && (
            <s-stack gap="small">
              <s-button
                variant="secondary"
                onClick={addComboProduct}
              >
                Add component product
              </s-button>

              {formData.comboReference.map((comp, index) => (
                <s-stack
                  key={index}
                  direction="inline"
                  gap="small"
                  alignItems="center"
                >
                  <s-select
                    label={`Component product #${index + 1}`}
                    value={comp.productId}
                    onChange={handleComboChange(index, "productId")}
                  >
                    <s-option value="">
                      Select raw product
                    </s-option>
                    {rawProductOptions.map((opt) => (
                      <s-option
                        key={opt.value}
                        value={opt.value}
                      >
                        {opt.label}
                      </s-option>
                    ))}
                  </s-select>

                  <s-text-field
                    label="Quantity"
                    type="number"
                    value={comp.quantity}
                    onInput={handleComboChange(index, "quantity")}
                  />

                  <s-button
                    tone="critical"
                    variant="tertiary"
                    onClick={() => removeComboProduct(index)}
                  >
                    Remove
                  </s-button>
                </s-stack>
              ))}
            </s-stack>
          )}

          {/* Duplicate root product */}
          {formData.isDuplicate && (
            <s-select
              label="Select root product"
              value={formData.rootProductId}
              onChange={handleSelectChange("rootProductId")}
            >
              <s-option value="">
                Select root product
              </s-option>
              {rawProductOptions.map((opt) => (
                <s-option key={opt.value} value={opt.value}>
                  {opt.label}
                </s-option>
              ))}
            </s-select>
          )}

          {/* Actions */}
          <s-stack direction="inline" gap="small">
            <s-button
              variant="primary"
              loading={isSubmitting && currentIntent === "save"}
              onClick={handleSubmit}
            >
              Update
            </s-button>

            <s-button
              variant="secondary"
              href="/app/inventory/product-mapping"
            >
              Cancel
            </s-button>

            <s-button
              variant="tertiary"
              tone="critical"
              loading={isSubmitting && currentIntent === "delete"}
              onClick={handleDelete}
            >
              Delete
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}