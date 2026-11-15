# Farm revenue forecasts

Open **Imports** and add land, harvests, farm payments, purchase lots and machine records. The column templates on each card also work as JSON object keys. Use a stable record ID for reimports and the same field ID across datasets. A field can be identified by a boundary or a table of acres. File and row provenance, unknown source columns and rows that need correction remain in browser storage.

Open **Finance → Your numbers** for forward-looking agronomic and market assumptions. Each assumption has an ID and a source. Scope it to a field, crop, growing season, predecessor or outlook as appropriate. A source can identify a farm record, a local trial, a contract, a published benchmark or the model that supplied a prediction interval. An assumption with no season can apply in multiple forecast years. The engine never extrapolates an annual price or yield growth rate on its own.

## Acreage and rotation

Mapped acres use a WGS84 Lambert azimuthal equal-area projection centred at the field and 4,046.8564224 square metres per acre. The engine preserves a recorded total and honours explicit farmer acreage corrections. Provide usable acres or unavailable acres to establish the available planting area. Provide planted and harvested acres directly, or use recorded planted and harvested areas to estimate the historical planting footprint and harvest fraction. A subfield with an independent crop allocation needs its own field ID and acreage. Double crops in a Planner season use the same ground sequentially.

For tabular land, `currentRotation` and `proposedRotation` are ordered sequences beginning in the selected first season. `previousCrop` and `previousCover` describe the preceding season. For mapped fields, the current sequence can also come from consecutive crop history and harvest records. The most recently updated saved Planner plan takes precedence for the proposed rotation. Its complete sequence, including cover crops, repeats beyond the saved years. A missing proposed plan or sequence follows the current rotation and is identified in the calculation details.

## Production and uncertainty

For each field and crop, historical yield is total measured production divided by harvested acres. A configured recency weight multiplies both production and harvested area in its historical season. The central estimate uses available field history before other farm fields. A comparable regional benchmark can fill a yield gap, and appears alongside sparse local history. A locally relevant benchmark can be entered for any region. The bundled Iowa budgets are scoped to the recorded location, crop and predecessor.

Production equals expected harvested acres times expected yield. Crop-specific US trade weights convert supported grain bushels. Mass conversions distinguish short tons, tonnes, pounds and US hundredweight. An unknown bushel weight requires a corrected unit. Explicit field loss in measured harvest quantity is already reflected in historical yield. Enter only an *additional* evidenced harvest loss for the forecast.

The engine tests comparable prior-crop groups before applying an observed rotation effect. The alternative is a sourced additive adjustment in crop units per acre. A final modeled yield incorporates all effects. Conservative and optimistic yield and price can use observed growing-season variation or supplied scenario values. Observed endpoints are sensitivity scenarios. Their joint occurrence has no estimated probability. Supplying a regional yield, a point price or a capacity constraint by itself cannot justify a percentage change in revenue.

For multi-year nutrient modeling, `soilNOpening` gives measured plant-available nitrogen in `lb N/ac`. A sourced `soilNChange` gives the net seasonal change in that unit for the crop. An optional calibrated `soilNResponse` in `bu/lb N` or `lb/lb N` converts departure from the opening reference into an additive soil yield effect. The trace shows opening and closing balances in each rotation. A missing transition interrupts the modeled balance until another measurement is available. Weather, management and soil response coefficients must be supplied for the field or an applicable region.

## Revenue and operating expenses

Every confirmed contract specifies a commodity, growing season, quantity, unit and price. Field-specific contracts are filled first. A whole-farm contract shares its volume across remaining eligible production in proportion to field quantities. Price uncontracted production using a farmer-entered expected price, a sourced commodity outlook or the quantity-weighted realized price from prior growing-season sales. Regional basis, delivery and marketing adjustments can convert a market quote to a farm-gate price. The ledger keeps payment timing and receivables separate from the growing season of the sale.

Supplier purchases and opening inventory form lots with unit cost equal to amount divided by quantity. Application records draw down a lot and link actual usage to a field, crop and season. A linked supplier payment settles the purchase. Unused inventory retains its quantity and value. Historical applied inputs and linked operating expenses are divided by historical planted acres. A sourced `input-rate` can replace a category's quantity per acre using a specified lot and predecessor. The field trace shows the resulting cost and any supported savings.

Seed, fertilizer, chemicals, fuel, labour, irrigation, machinery, cover crops and other operating costs belong in the operating budget. Declare `expense-coverage` only for a historical crop and season with a complete accounting, or supply a complete `operating-rate` per planted acre. Partial expenses stay visible. Net operating return requires both complete expenses and gross crop revenue. Government payments, insurance proceeds, loans, transfers, financing expenses, depreciation, taxes, rent and capital expenditures remain separately identifiable.

A cover in the Planner also needs a cost basis. A matching complete historical crop-and-cover budget, a cover-specific operating rate, or a complete cash-crop budget plus a sourced `cover-rate` in USD per acre can supply it. Use `plannedCover` for the cover planted in this season and `previousCover` for the cover preceding the cash crop.

Equipment capacity in hectares per day is working width in metres times speed in km/h times operating hours per day times field efficiency, divided by ten. The engine converts capacity to acres and shares available machine-days across compatible field demands for planting and harvesting. Shortfalls appear in the field calculation details. An unavailable machine-day alone has no modeled yield penalty.

## Reading the dashboard

Select the first growing season, a 3-, 5- or 10-year horizon and an outlook. The same forecast inputs, contracts and equipment are available separately to each rotation. A difference is proposed minus current. A percentage requires a nonzero current gross revenue. Farm and cumulative totals inherit missing field values so a partial subtotal cannot appear as a complete farm return. Open the field calculation details to find the missing inputs or audit a result. Changes to imports, assumptions, acreage or Planner sequences recalculate the dashboard and Overview finance summary.
