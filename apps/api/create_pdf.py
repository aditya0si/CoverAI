import fitz
doc = fitz.open()
page = doc.new_page()
text = """
CoverAI Motor Insurance Policy
Policy Number: CA-998877
Insurer Name: HDFC Ergo
Vehicle Registration: MH-02-AB-1234
Vehicle: Tesla Model 3 (2024)
Premium Amount: 18,500
Insured Declared Value (IDV): INR 6,50,000
Start Date: 15/05/2024
End Date: 14/05/2025

Terms and Conditions:
1. This policy covers own damage and third party liability.
2. The Insured Declared Value (IDV) of the vehicle is fixed at INR 6,50,000.
3. In case of theft or total loss, the claim amount paid will be the IDV of INR 6,50,000 minus deductibles.
"""
page.insert_text((50, 50), text, fontsize=11)
doc.save("/app/sample-policy.pdf")
doc.close()
print("PDF created successfully!")
