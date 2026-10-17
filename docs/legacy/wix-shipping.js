import { getSecret } from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';

export async function getShippingRates(options, context) {
    let nigeriaWeight = 0;
    let usSubtotal = 0;
    let nigeriaSubtotal = 0;
    let hasUSItems = false;
    let hasNigeriaItems = false;
    let hasPreOrderItems = false; 
    let usLineItems = [];
    
    const dest = options.shippingDestination;
    const destCountry = dest?.country?.toUpperCase() || 'US'; 
    const destState = dest?.subdivision; 
    
    // 1. Fetch product info from database
    const productIds = options.lineItems.map(item => item.catalogReference.catalogItemId);
    const productsData = await wixData.query("Stores/Products")
        .hasSome("_id", productIds)
        .include("collections")
        .find({ suppressAuth: true });
        
    // 2. Process cart values defensively
    options.lineItems.forEach(item => {
        const productDbInfo = productsData.items.find(p => p._id === item.catalogReference.catalogItemId);
        
        let isUSProduct = false;
        let isPreOrder = false;
        
        if (productDbInfo && productDbInfo.collections) {
            isUSProduct = productDbInfo.collections.some(col => col.name && col.name.toLowerCase().trim() === "shipped from us");
            isPreOrder = productDbInfo.collections.some(col => {
                const name = col.name ? col.name.toLowerCase().trim() : "";
                return name === "pre-order" || name === "preorder";
            });
        }
        
        if (isPreOrder) hasPreOrderItems = true;

        let itemPriceValue = 0;
        if (item && item.price) {
            if (typeof item.price === 'object' && item.price !== null) {
                if ('amount' in item.price) itemPriceValue = Number(item.price.amount) || 0;
                else if ('price' in item.price && item.price.price && 'amount' in item.price.price) {
                    itemPriceValue = Number(item.price.price.amount) || 0;
                }
            } else {
                itemPriceValue = Number(item.price) || 0;
            }
        }

        const quantity = item.quantity || 1;
        const lineTotal = itemPriceValue * quantity;
        
        if (isUSProduct) {
            hasUSItems = true;
            usSubtotal += lineTotal;
            usLineItems.push(item);
        } else {
            hasNigeriaItems = true;
            nigeriaSubtotal += lineTotal;
            const itemWeight = item.physicalProperties?.weight || 1.5; 
            nigeriaWeight += (itemWeight * quantity);
        }
    });

    let rates = [];
    const isUpsException = (destCountry === 'CA' || (destCountry === 'US' && ['AK', 'HI', 'OR'].includes(destState)));
    const totalCartSubtotal = usSubtotal + nigeriaSubtotal; 

    // --- TIMELINE TEXT GENERATOR ---
    const prodText = hasPreOrderItems ? " after production" : "";
    const shortProdText = hasPreOrderItems ? " (after prod.)" : "";

    const ngStdDays = `10-21 days${prodText}`;
    const ngExpDays = `2-3 days${prodText}`;
    
    // UPDATED: Standard is 2-5 days, Expedited is 2-3 days for US items
    const usStdDays = `2-5 working days${prodText}`;
    const mixedStdTimeline = `Shipping from US: 2-5 working days${shortProdText} | Shipping from Nigeria: 10-21 days${shortProdText}`;
    const mixedExpTimeline = `Shipping from US: 2-3 working days${shortProdText} | Shipping from Nigeria: 2-3 days${shortProdText}`;

    // ==========================================
    // SCENARIO A: US ITEMS ONLY TO UPS TERRITORY
    // ==========================================
    if (hasUSItems && !hasNigeriaItems && isUpsException) {
        return { shippingRates: await getFullUpsRates(usLineItems, dest, totalCartSubtotal, options.metadata?.currency) };
    }

    // ==========================================
    // SCENARIO B: NIGERIA OR MIXED CARTS
    // ==========================================
    let flatStandardFee = totalCartSubtotal >= 150 ? 0 : 20.00;
    
    let liveUpsExceptionFee = 0;
    if (isUpsException && hasUSItems && hasNigeriaItems) {
        liveUpsExceptionFee = await getCheapestUpsRate(usLineItems, dest, totalCartSubtotal);
    }

    // --- RULE 1: STANDARD SHIPPING (Removed DHL from names) ---
    if (destCountry === 'US' || destCountry === 'CA') {
        let totalStandardFee = 0;
        let standardTitle = "";

        if (isUpsException && hasUSItems && hasNigeriaItems) {
            totalStandardFee = liveUpsExceptionFee + flatStandardFee;
            standardTitle = `Standard Delivery (${mixedStdTimeline})`;
        } 
        else if (hasUSItems && hasNigeriaItems && !isUpsException) {
            totalStandardFee = flatStandardFee;
            standardTitle = `Standard Delivery (${mixedStdTimeline})`;
        } 
        else if (hasUSItems && !hasNigeriaItems) {
            totalStandardFee = flatStandardFee;
            standardTitle = `Standard Delivery - Shipping from US (${usStdDays})`;
        } 
        else {
            totalStandardFee = flatStandardFee;
            standardTitle = `Standard Delivery - Shipping from Nigeria (${ngStdDays})`;
        }

        rates.push({
            code: "standard_rate",
            title: standardTitle, 
            logistics: { deliveryTime: standardTitle }, 
            cost: { price: totalStandardFee.toFixed(2), currency: options.metadata?.currency || "USD" }
        });
    }

    // --- RULE 2: DHL EXPEDITED SHIPPING (FEZ) ---
    if (hasNigeriaItems && (destCountry === 'US' || destCountry === 'CA' || destCountry === 'MX')) {
        const fezBasePrice = getFezBasePrice(nigeriaWeight);
        let discountedNaira = fezBasePrice - 13500;
        if (discountedNaira < 0) discountedNaira = 0; 
        const conversionRate = await getUSDConversionRateWithTimeout();
        const fezUsd = (discountedNaira / conversionRate);

        let totalExpeditedFee = fezUsd;
        let expeditedTitle = `DHL Expedited Shipping - Shipping from Nigeria (${ngExpDays})`;

        if (hasUSItems) {
            expeditedTitle = `DHL Expedited Shipping (${mixedExpTimeline})`;
        }

        rates.push({
            code: "expedited_rate",
            title: expeditedTitle,
            logistics: { deliveryTime: expeditedTitle },
            cost: { price: totalExpeditedFee.toFixed(2), currency: options.metadata?.currency || "USD" }
        });
    }

    return { shippingRates: rates };
}

// ==========================================
// UPS API INTEGRATION FUNCTIONS
// ==========================================

async function getUPSToken() {
    const clientId = await getSecret('UPS_CLIENT_ID');
    const clientSecret = await getSecret('UPS_CLIENT_SECRET');
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}` },
        body: 'grant_type=client_credentials'
    });
    const data = await response.json();
    return data.access_token;
}

async function getFullUpsRates(usLineItems, dest, cartSubtotal, currencyFallback) {
    try {
        const result = await callUpsApi(usLineItems, dest);
        const countryCode = dest.country ? dest.country.toUpperCase() : "US";
        const isCA = countryCode === "CA";
        
        const upsServiceCodes = {
            "01": "Next Day Air", "02": "2nd Day Air", "03": "Ground", "07": "Worldwide Express",
            "08": "Worldwide Expedited", "11": "Standard to Canada", "12": "3 Day Select",
            "13": "Next Day Air Saver", "65": "Worldwide Saver"       
        };

        const shipments = Array.isArray(result.RateResponse.RatedShipment) ? result.RateResponse.RatedShipment : [result.RateResponse.RatedShipment];

        return shipments.map(rate => {
            const srvCode = rate.Service.Code;
            const friendlyName = upsServiceCodes[srvCode] || "Standard Shipping";
            const priceValue = rate.TotalCharges.MonetaryValue;
            const currency = rate.TotalCharges.CurrencyCode;

            let finalPrice = priceValue.toString();
            let finalTitle = `UPS® ${friendlyName}`;
            
            // UPDATED: Match the 2-5 working days expectation for UPS Standard Options
            let dynamicTimeline = "2-5 working days on orders from the US";

            if (isCA) {
                dynamicTimeline = "2-5 working days on orders from the US to Canada";
                if (cartSubtotal >= 150 && srvCode === "11") {
                    finalPrice = "0.00";
                    finalTitle = `UPS® Standard to Canada (Free Shipping Over $150)`;
                }
            } else {
                if (cartSubtotal >= 150 && srvCode === "03") {
                    finalPrice = "0.00";
                    finalTitle = `UPS® Ground (Free Shipping Over $150)`;
                }
            }

            return {
                code: `ups-${srvCode}`,
                title: finalTitle, 
                logistics: { deliveryTime: dynamicTimeline },
                cost: { price: finalPrice, currency: currency }
            };
        });
    } catch (error) {
        console.error("UPS API Error:", error.message);
        const isCA = dest.country && dest.country.toUpperCase() === "CA";
        return [{
            code: 'ups-fallback',
            title: isCA ? "UPS® Standard to Canada" : "UPS® Ground (Standard)",
            logistics: { deliveryTime: isCA ? "2-5 working days" : "2-5 working days" },
            cost: { price: isCA ? '35.00' : '22.00', currency: currencyFallback || 'USD' }
        }];
    }
}

async function getCheapestUpsRate(usLineItems, dest, cartSubtotal) {
    try {
        const isCA = dest.country && dest.country.toUpperCase() === "CA";
        if (cartSubtotal >= 150) return 0; 

        const result = await callUpsApi(usLineItems, dest);
        const shipments = Array.isArray(result.RateResponse.RatedShipment) ? result.RateResponse.RatedShipment : [result.RateResponse.RatedShipment];
        
        const standardRate = shipments.find(s => s.Service.Code === "03" || s.Service.Code === "11");
        if (standardRate) return Number(standardRate.TotalCharges.MonetaryValue);
        
        const cheapest = shipments.sort((a,b) => Number(a.TotalCharges.MonetaryValue) - Number(b.TotalCharges.MonetaryValue))[0];
        return Number(cheapest.TotalCharges.MonetaryValue);
    } catch (error) {
        return (dest.country && dest.country.toUpperCase() === "CA") ? 35.00 : 22.00; 
    }
}

async function callUpsApi(usLineItems, dest) {
    const token = await getUPSToken();
    const countryCode = dest.country ? dest.country.toUpperCase() : "US";
    const stateCode = dest.subdivision ? (dest.subdivision.includes('-') ? dest.subdivision.split('-')[1] : dest.subdivision) : "";

    const packages = usLineItems.map(item => {
        const itemWeightLbs = Math.ceil(((item.quantity || 1) * 2) * 2.20462);
        return {
            "PackagingType": { "Code": "02" }, 
            "PackageWeight": {
                "UnitOfMeasurement": { "Code": "LBS" }, 
                "Weight": String(itemWeightLbs)
            }
        };
    });

    const upsRequest = {
        "RateRequest": {
            "Request": { "RequestOption": "Shop" }, 
            "Shipment": {
                "Shipper": {
                    "Name": "Haanta Hub", "ShipperNumber": "<REDACTED: UPS_SHIPPER_NUMBER secret>", 
                    "Address": {
                        "AddressLine": ["Gatemound Ct"], "City": "Lakemont",
                        "StateProvinceCode": "TX", "PostalCode": "77407", "CountryCode": "US"
                    }
                },
                "ShipTo": {
                    "Address": {
                        "AddressLine": [dest.addressLine1 || ""], "City": dest.city || "Lakemont",
                        "StateProvinceCode": stateCode, "PostalCode": dest.postalCode || "", "CountryCode": countryCode
                    }
                },
                "Package": packages
            }
        }
    };

    const response = await fetch('https://onlinetools.ups.com/api/rating/v1/shop', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(upsRequest)
    });
    const result = await response.json();
    if (!result.RateResponse || !result.RateResponse.RatedShipment) throw new Error("Invalid UPS response");
    return result;
}

// ==========================================
// FEZ API & EXCHANGE LOGIC
// ==========================================

async function getUSDConversionRateWithTimeout() {
    const fetchPromise = fetch("https://api.exchangerate-api.com/v4/latest/USD")
        .then(res => res.json())
        .then(data => {
            const liveRate = data.rates.NGN;
            return liveRate > 1350 ? 1350 : liveRate;
        });

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(1350), 1000));
    try { return await Promise.race([fetchPromise, timeoutPromise]); } 
    catch (error) { return 1350; }
}

function getFezBasePrice(totalWeight) {
    const fezRates = [
        { maxWeight: 0.5, price: 69966.55 }, { maxWeight: 1.0, price: 70201.25 },
        { maxWeight: 1.5, price: 70435.95 }, { maxWeight: 2.0, price: 70670.65 },
        { maxWeight: 2.5, price: 95551.96 }, { maxWeight: 3.0, price: 118329.27 },
        { maxWeight: 3.5, price: 141106.61 }, { maxWeight: 4.0, price: 167634.98 },
        { maxWeight: 4.5, price: 183192.74 }, { maxWeight: 5.0, price: 187873.97 },
        { maxWeight: 6.0, price: 219470.29 }, { maxWeight: 7.0, price: 246307.56 },
        { maxWeight: 8.0, price: 273144.87 }, { maxWeight: 9.0, price: 299982.15 },
        { maxWeight: 10.0, price: 332198.74 }
    ];
    const applicableTier = fezRates.find(tier => totalWeight <= tier.maxWeight);
    return applicableTier ? applicableTier.price : 1947509.19; 
}