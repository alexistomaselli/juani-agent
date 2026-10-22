CREATE TABLE public."Product" (id text PRIMARY KEY, name text, active boolean NOT NULL DEFAULT true, "updatedAt" timestamptz DEFAULT now());
CREATE TABLE public."Order" (id text PRIMARY KEY, "productId" text REFERENCES public."Product"(id), quantity integer NOT NULL, status text NOT NULL DEFAULT 'PENDING');
INSERT INTO public."Product"(id,name) VALUES ('legacy','Legacy');
INSERT INTO public."Order"(id,"productId",quantity) VALUES ('legacy','legacy',2);
